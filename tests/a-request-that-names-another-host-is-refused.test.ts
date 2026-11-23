// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST THAT NAMES ANOTHER HOST IS REFUSED, AND TOUCHES NOTHING (wave 13s, line 13s, SEC-1).
 *
 * A page on another site, or on another port of this machine, can make a browser send a request to the office under a
 * name that is not the office's own. So every request a listener carries is checked before anything else: the name
 * and the port in its Host header must be ones the listener it arrived on takes as this office. Anything else is
 * refused with the coded refusal hostIsNotThisOffice, status 421, before any other hook or any route runs.
 *
 * ---------------------------------------------------------------------------------------
 * THE NAMES EACH LISTENER TAKES
 * ---------------------------------------------------------------------------------------
 *
 *   - Every listener: 127.0.0.1, localhost or [::1], with the port of the socket the request came in on.
 *   - The door for other machines, also, with that same port: the host of the setting for other machines, the address
 *     for browsers in force, one of this machine's own numbers, the number the door's socket is bound to, this
 *     machine's own tailnet name, and its short name, the tailnet name's first label.
 *   - The second listener, which a proxy on this computer carries requests to: the names the door for other machines
 *     takes, with no port and with :443, because that is how such a proxy sends them.
 *
 * Elsewhere a Host with no port names port 80. A name is taken only when the office already holds it, from the
 * setting, as the address for browsers, or as this machine's own tailnet name or its short name, which the office
 * reads from this machine's own tailscale and never from a request: the office never looks up the name a request used.
 *
 * What is proved:
 *   1. a Host that names another site is refused on each listener, and the request reaches no door and writes nothing;
 *   2. a loopback name with another port, or with no port, is refused;
 *   3. 127.0.0.1, localhost and [::1] with the port the request came in on are answered on each listener as before;
 *   4. the door for other machines refuses a foreign Host, answers its own name, and still sends a page load by one of
 *      this machine's numbers on to the address for browsers;
 *   5. the refusal is said in English and in Chinese, gives the office's loopback address with its port, names the
 *      Settings page, and never repeats the Host it refused;
 *   6. the door for other machines takes the number its socket is bound to, with its port;
 *   7. a name in the private network's shape is refused at the door for other machines until it is the address for
 *      browsers, and taken once it is;
 *   8. the second listener takes the address for browsers with no port and with :443, and refuses it with the port of
 *      its own socket;
 *   9. a name the office does not hold is refused even when it would stand for this machine, and it is not looked up;
 *  10. the door for other machines takes the host of the setting for other machines;
 *  11. a request with no Host is refused the same way.
 *  12. no tailnet name is held until a read names one: building and serving the app asks for none, and while the
 *      probe answers null the door for other machines refuses this machine's tailnet name with its port;
 *  13. the door for other machines takes this machine's tailnet name with its port once the probe names it, written
 *      with a final dot as tailscale writes it, and refuses it with another port or none;
 *  14. the second listener takes this machine's tailnet name with no port and with :443, and refuses it with the port
 *      of its own socket;
 *  15. the loopback listener refuses this machine's tailnet name, with its port, with none and with :443;
 *  16. a read that finds no name keeps the last name read and says once that it failed, and a later read that names
 *      another name replaces it;
 *  17. each refusal writes one line in the server's log, naming the kind of its Host and the listener that carried
 *      it, and the line never holds the Host;
 *  18. the status text gives the DNSName of Self with the final dot taken off, in lower case;
 *  19. a status with no Self, or with an empty DNSName, gives no name;
 *  20. a text that is not JSON gives no name.
 *  21. the door for other machines takes this machine's short tailnet name, the text before the tailnet name's first
 *      dot, with its port once the probe names the full name, and refuses it with another port, with none and with
 *      :443;
 *  22. the second listener takes the short name with no port and with :443, and refuses it with the port of its own
 *      socket;
 *  23. the loopback listener refuses the short name, with its port, with none and with :443, and each refusal writes
 *      one line in the server's log whose kind is name;
 *  24. a read that finds no name gives no short name for a name no read found, and keeps the short name of the name
 *      it keeps; a later read that names another name moves the short name to that name's first label;
 *  25. names that are only like the short name are refused at the door for other machines, and so is the first label
 *      of the address for browsers and of the setting for other machines.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THIS FILE STANDS IN FOR THE NETWORK, WITH NO NETWORK AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * The three listeners are the product's own: the app's own server on 127.0.0.1, `serveTheAddressForOtherMachines` on
 * 127.0.0.2, as tests/one-address-for-the-office.test.ts opens it, and `listenForOtherMachines` on 127.0.0.1. Each
 * request names its Host, because the Host is the subject. Two of the probe's methods are replaced. Its list of this
 * machine's own addresses names THE_NUMBER, an address from the range kept for documentation, in the cases that ask
 * for it. Its read of this machine's tailnet name is replaced from before the app is built to the end of the file: it
 * answers from a status text written here, through the product's own parsing of that text, or answers null as a read
 * that found nothing does, so this machine's own tailscale is never asked. The name is made up, in a domain kept for
 * documentation. A case reads the tailnet name by calling the product's read itself, because the app a test builds
 * starts no read. No name is looked up on the network: the resolver is replaced for the whole file by THE_RESOLVER.
 *
 * The server's logger is on and writes into THE_LOG, which is how case 17 reads the line a refusal writes. That seam
 * is `buildApp`'s own and is not a setting, as tests/a-slow-request-says-so-in-the-log.test.ts says.
 */

import { request, type Server } from 'node:http'
import { connect, type AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { settings } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TheKindOfAHost } from '../src/server/lib/a-host-that-is-not-this-office.ts'
import type { OsProbe } from '../src/server/lib/resources.ts'
import { freshDb, type TestDb } from './helpers.ts'

/** The door for other machines is bound to a second loopback address, as the other tests of that door are. */
const THE_DOORS_ADDRESS = '127.0.0.2'
/** This machine's own number, as the probe names it here: an address from the range kept for documentation. */
const THE_NUMBER = '198.51.100.8'
/** The name the person chooses as the address for browsers. */
const THE_NAME = 'the-office.example'
/**
 * A name in the shape a private network gives a machine, in a domain kept for documentation. It stands for this
 * machine's number, so the person may choose it; until they do, the office does not hold it.
 */
const A_PRIVATE_NETWORK_NAME = 'the-office.a-private-network.example'
/** The name the setting for other machines holds, in the one case that sets it. */
const THE_SETTINGS_NAME = 'the-office-by-its-setting.example'
/** A name that is not this office's, whatever it stands for. */
const A_FOREIGN_NAME = 'evil.example'
/** The setting for other machines, by its name in src/config/settings.mjs. */
const THE_SETTING = 'MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES'
/** This machine's own tailnet name, as the probe reads it here: a made-up name in a domain kept for documentation. */
const THE_TAILNET_NAME = 'this-machine.a-tailnet.example'
/** The name a later read finds, as when the person renames this machine in their tailnet. */
const ANOTHER_TAILNET_NAME = 'this-machine-renamed.a-tailnet.example'

/**
 * The status text tailscale writes, cut to what the read uses. Its DNSName ends with a dot, which is how tailscale
 * writes it.
 */
function aStatusNaming(name: string): string {
  return JSON.stringify({ BackendState: 'Running', Self: { HostName: 'this-machine', DNSName: `${name}.` } })
}

/** How many times a probe of this file was asked for the tailnet name, so case 12 can say that nothing else asked. */
let askedForTheTailnetName = 0

/** Every name this file looks up, in the order it was asked, so a case can say that the check looked nothing up. */
const lookedUp: string[] = []

/** What a name stands for here, in place of the network. */
async function THE_RESOLVER(name: string): Promise<readonly string[]> {
  lookedUp.push(name)
  if (name === THE_NAME || name === A_PRIVATE_NETWORK_NAME || name === THE_SETTINGS_NAME) return [THE_NUMBER]
  throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${name}`), { code: 'ENOTFOUND' })
}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Under an agent's name, as the one-address test asks: which address was named is the question, not who asked. */
const A_CALLER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-synthetic-caller',
}

/** What a browser sends when it opens a page. */
const A_PAGE_LOAD = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

/** The door this file adds, which counts every request that reaches it. It stands for any door that writes. */
const THE_COUNTING_DOOR = '/a-door-that-counts-who-reaches-it'
let reachedTheCountingDoor = 0

type Listener = 'the loopback listener' | 'the door for other machines' | 'the second listener'
const EVERY_LISTENER: readonly Listener[] = ['the loopback listener', 'the door for other machines', 'the second listener']
const EVERY_KIND_OF_HOST: readonly TheKindOfAHost[] = ['loopback', 'number', 'name', 'none']

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

/** A port that is not the listener's own. */
function anotherPortThan(listener: Listener): number {
  const port = thePortOf(listener)
  return port === 65535 ? 1024 : port + 1
}

/**
 * Replace the read of this machine's tailnet name, and the list of its own addresses when one is given; every other
 * answer is the real probe's. The read answers from `status` through the product's own parsing of the status text,
 * and null stands for a read that found nothing, as when the program is missing, fails or runs past its limit.
 */
function theMachineHas(addresses: readonly string[] | 'its own', status: string | null = null): void {
  if (resources === undefined) throw new Error('the operating system layer was not loaded')
  const layer = resources
  const probe = Object.create(layer.LINUX_PROBE) as OsProbe
  if (addresses !== 'its own') probe.ownAddresses = () => addresses
  probe.ownTailnetName = () => {
    askedForTheTailnetName += 1
    return Promise.resolve(status === null ? null : layer.ownTailnetNameIn(status))
  }
  layer.useOsProbe(probe)
}

/**
 * One read of this machine's tailnet name, by the product's own read, through a probe that answers from `status`.
 * It gives back the lines the read said.
 */
async function readTheTailnetName(status: string | null): Promise<string[]> {
  if (hostCheck === undefined) throw new Error('the Host check was not loaded')
  theMachineHas([THE_NUMBER], status)
  const said: string[] = []
  await hostCheck.readThisMachinesTailnetName((line) => said.push(line))
  return said
}

async function choose(address: string | null): Promise<number> {
  const reply = await theApp().inject({ method: 'POST', url: '/api/office/address-for-browsers', headers: AS_THE_PERSON, payload: { address } })
  return reply.statusCode
}

interface Answer {
  status: number
  location: string | undefined
  body: string
  json: Record<string, unknown> | undefined
}

/** One request through a listener, with the Host it names, sent over a real socket. */
function ask(input: { through: Listener; host: string; path?: string; method?: 'GET' | 'POST'; accept?: string; body?: string }): Promise<Answer> {
  return new Promise((done, fail) => {
    const req = request(
      {
        host: theAddressOf(input.through),
        port: thePortOf(input.through),
        path: input.path ?? '/api/access',
        method: input.method ?? 'GET',
        headers: {
          ...A_CALLER,
          ...(input.accept === undefined ? {} : { accept: input.accept }),
          ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
          host: input.host,
        },
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => { body += chunk })
        res.once('end', () => {
          const location = res.headers.location
          done({ status: res.statusCode ?? 0, location: typeof location === 'string' ? location : undefined, body, json: parsed(body) })
        })
      },
    )
    req.once('error', fail)
    req.end(input.body)
  })
}

/**
 * One request through a listener with no Host header at all. HTTP/1.1 requires one, and Node's own server answers 400
 * to an HTTP/1.1 request without it before the office sees anything, so this is sent as HTTP/1.0, where a Host is
 * optional and the request reaches the office.
 */
function askWithNoHost(through: Listener): Promise<Answer> {
  return new Promise((done, fail) => {
    const socket = connect({ host: theAddressOf(through), port: thePortOf(through) })
    let said = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => { said += chunk })
    socket.once('error', fail)
    socket.once('end', () => {
      const split = said.indexOf('\r\n\r\n')
      const head = split === -1 ? said : said.slice(0, split)
      const body = split === -1 ? '' : said.slice(split + 4)
      const status = Number(/^HTTP\/1\.[01] (\d{3})/u.exec(head)?.[1] ?? 0)
      done({ status, location: undefined, body, json: parsed(body) })
    })
    socket.once('connect', () => {
      const lines = ['GET /api/access HTTP/1.0', ...Object.entries(A_CALLER).map(([name, value]) => `${name}: ${value}`), '', '']
      socket.end(lines.join('\r\n'))
    })
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

/** The refusal's English, read from the words file the page reads it from. */
function theEnglish(port: number): string {
  if (words === undefined) throw new Error('the words were not loaded')
  return words.createI18n('en').t('server.hostIsNotThisOffice', { port })
}

/** The answer is the coded refusal, with the port of the socket the request came in on and its English. */
function expectRefused(answer: Answer, listener: Listener, what: string): void {
  const port = thePortOf(listener)
  expect(answer.status, `${what} on ${listener}: ${answer.body}`).toBe(421)
  expect(answer.json, `${what} on ${listener}`).toEqual({ error: theEnglish(port), code: 'hostIsNotThisOffice', values: { port } })
  expect(answer.location, `${what} on ${listener}`).toBeUndefined()
}

/** The answer is the door's own, as it was before any Host was checked: GET /api/access answers 200. */
function expectAnswered(answer: Answer, listener: Listener, what: string): void {
  expect(answer.status, `${what} on ${listener}: ${answer.body}`).toBe(200)
  expect(answer.json?.code, `${what} on ${listener}`).toBeUndefined()
}

beforeAll(async () => {
  t = await freshDb()
  resources = await import('../src/server/lib/resources.ts')
  words = await import('../src/shared/i18n.ts')
  hostCheck = await import('../src/server/lib/a-host-that-is-not-this-office.ts')
  const { useANameResolver } = await import('../src/server/lib/address-for-browsers.ts')
  useANameResolver(THE_RESOLVER)
  // THE PROBE IS THIS FILE'S BEFORE THE APP IS BUILT, so case 12 can say that building and serving the app asked it
  // for no tailnet name, and this machine's own tailscale is never asked.
  theMachineHas('its own')
  // THE APP AS tests/helpers.ts BUILDS IT, with the logger on and writing into THE_LOG.
  const { buildApp, serveTheAddressForOtherMachines, listenForOtherMachines } = await import('../src/server/index.ts')
  app = (await buildApp({
    production: false,
    webDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    webAppUrl: settings().webAddress,
    logLevel: 'info',
    logStream: THE_LOG,
  })).app
  app.post(THE_COUNTING_DOOR, () => {
    reachedTheCountingDoor += 1
    return { reached: reachedTheCountingDoor }
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = await serveTheAddressForOtherMachines(app, 0, THE_DOORS_ADDRESS)
  second = await listenForOtherMachines(app, 0, '127.0.0.1')
})

afterEach(async () => {
  // The real probe's own addresses again, and still this file's read of the tailnet name.
  if (resources !== undefined) theMachineHas('its own')
  if (app !== undefined) await choose(null)
})

afterAll(async () => {
  resources?.useOsProbe(resources.LINUX_PROBE)
  const { useANameResolver } = await import('../src/server/lib/address-for-browsers.ts')
  useANameResolver(null)
  for (const server of [door, second]) if (server !== undefined) await new Promise<void>((done) => server.close(() => done()))
  if (app !== undefined) await app.close()
  t?.close()
})

describe('a request whose Host is not this office is refused before anything is done', () => {
  it('1: refuses a request whose Host names another site, and writes nothing', async () => {
    theMachineHas([THE_NUMBER])
    // CONTROL: the counting door is reached when the Host is the listener's own.
    const reached = await ask({ through: 'the loopback listener', host: `127.0.0.1:${String(thePortOf('the loopback listener'))}`, path: THE_COUNTING_DOOR, method: 'POST', body: '{}' })
    expect(reached.status, reached.body).toBe(200)
    expect(reachedTheCountingDoor).toBe(1)
    const count = (table: 'records' | 'changes'): number =>
      (t?.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
    for (const listener of EVERY_LISTENER) {
      for (const host of [A_FOREIGN_NAME, `${A_FOREIGN_NAME}:${String(thePortOf(listener))}`, `203.0.113.9:${String(thePortOf(listener))}`]) {
        expectRefused(await ask({ through: listener, host, path: THE_COUNTING_DOOR, method: 'POST', body: '{}' }), listener, `a POST naming Host ${host}`)
        const before = { records: count('records'), changes: count('changes') }
        const write = await ask({ through: listener, host, path: '/api/records', method: 'POST', body: JSON.stringify({ kind: 'problem', title: 'A problem a page on another site filed', data: {} }) })
        expectRefused(write, listener, `a record written naming Host ${host}`)
        expect({ records: count('records'), changes: count('changes') }, `a record written naming Host ${host} on ${listener}`).toEqual(before)
      }
    }
    expect(reachedTheCountingDoor, 'a refused request reached the counting door').toBe(1)
  })

  it('2: refuses a loopback name with another port', async () => {
    for (const listener of EVERY_LISTENER) {
      const other = String(anotherPortThan(listener))
      for (const host of [`127.0.0.1:${other}`, `localhost:${other}`, `[::1]:${other}`]) {
        expectRefused(await ask({ through: listener, host }), listener, `Host ${host}`)
      }
    }
    // A loopback name with no port names port 80, and that is no listener's port here.
    for (const listener of EVERY_LISTENER) {
      for (const host of ['127.0.0.1', 'localhost', '[::1]']) expectRefused(await ask({ through: listener, host }), listener, `Host ${host}`)
    }
  })

  it('3: answers 127.0.0.1, localhost and [::1] with the serving port as before', async () => {
    for (const listener of EVERY_LISTENER) {
      const port = String(thePortOf(listener))
      for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]) {
        expectAnswered(await ask({ through: listener, host }), listener, `Host ${host}`)
      }
    }
  })

  it('4: refuses a foreign Host at the door for other machines, answers its own name, and sends one of this machine\'s numbers on', async () => {
    theMachineHas([THE_NUMBER])
    expect(await choose(THE_NAME)).toBe(200)
    const port = String(thePortOf('the door for other machines'))
    for (const host of [A_FOREIGN_NAME, `${A_FOREIGN_NAME}:${port}`, `${THE_NUMBER}.${A_FOREIGN_NAME}:${port}`, `${THE_NUMBER}:9999`]) {
      expectRefused(await ask({ through: 'the door for other machines', host, accept: A_PAGE_LOAD, path: '/settings' }), 'the door for other machines', `a page load naming Host ${host}`)
    }
    // Its own name, the address for browsers, with the door's port, is answered.
    expectAnswered(await ask({ through: 'the door for other machines', host: `${THE_NAME}:${port}` }), 'the door for other machines', `Host ${THE_NAME}:${port}`)
    // This machine's number is answered too: an API call where it arrived, a page load sent on to the chosen name.
    expectAnswered(await ask({ through: 'the door for other machines', host: `${THE_NUMBER}:${port}` }), 'the door for other machines', `Host ${THE_NUMBER}:${port}`)
    const sent = await ask({ through: 'the door for other machines', host: `${THE_NUMBER}:${port}`, accept: A_PAGE_LOAD, path: '/records/abc123?tab=links' })
    expect(sent.status, sent.body).toBe(307)
    expect(sent.location).toBe(`http://${THE_NAME}:${port}/records/abc123?tab=links`)
  })

  it('5: says the refusal in English and in Chinese', async () => {
    if (words === undefined) throw new Error('the words were not loaded')
    for (const listener of EVERY_LISTENER) {
      const port = thePortOf(listener)
      const refused = await ask({ through: listener, host: `${A_FOREIGN_NAME}:${String(port)}` })
      expectRefused(refused, listener, `Host ${A_FOREIGN_NAME}:${String(port)}`)
      const english = theEnglish(port)
      const chinese = words.createI18n('zh').t('server.hostIsNotThisOffice', { port })
      expect(chinese, 'the Chinese is the English, so no Chinese word was written').not.toBe(english)
      expect(chinese).toMatch(/\p{Script=Han}/u)
      for (const [language, said] of [['English', english], ['Chinese', chinese]] as const) {
        // It gives the office's own address on this computer, with the port the request came in on.
        expect(said, `the ${language}`).toContain(`http://127.0.0.1:${String(port)}`)
        // It says where the person chooses the name the office answers to: the Settings page, by the page's own name.
        expect(said, `the ${language}`).toContain(words.createI18n(language === 'English' ? 'en' : 'zh').t('nav.settings'))
        // It never repeats the Host it refused.
        expect(said, `the ${language}`).not.toContain(A_FOREIGN_NAME)
      }
      expect(refused.body).not.toContain(A_FOREIGN_NAME)
    }
  })

  it('6: takes the number the door for other machines is bound to, with its port', async () => {
    const port = String(thePortOf('the door for other machines'))
    expectAnswered(await ask({ through: 'the door for other machines', host: `${THE_DOORS_ADDRESS}:${port}` }), 'the door for other machines', `Host ${THE_DOORS_ADDRESS}:${port}`)
    // With another port, or none, it is refused like any other name.
    for (const host of [`${THE_DOORS_ADDRESS}:${String(anotherPortThan('the door for other machines'))}`, THE_DOORS_ADDRESS]) {
      expectRefused(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host}`)
    }
  })

  it('7: refuses a name in the private network\'s shape at the door for other machines until it is the address for browsers, and takes it once it is', async () => {
    theMachineHas([THE_NUMBER])
    const host = `${A_PRIVATE_NETWORK_NAME}:${String(thePortOf('the door for other machines'))}`
    expectRefused(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host} before it is chosen`)
    expect(await choose(A_PRIVATE_NETWORK_NAME)).toBe(200)
    expectAnswered(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host} once it is chosen`)
    expect(await choose(null)).toBe(200)
    expectRefused(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host} once it is no longer chosen`)
  })

  it('8: takes the address for browsers at the second listener with no port and with :443, and refuses it with the socket\'s port', async () => {
    theMachineHas([THE_NUMBER])
    const ownPort = String(thePortOf('the second listener'))
    // Before it is chosen, the name is not this office's on the second listener either.
    for (const host of [A_PRIVATE_NETWORK_NAME, `${A_PRIVATE_NETWORK_NAME}:443`]) {
      expectRefused(await ask({ through: 'the second listener', host }), 'the second listener', `Host ${host} before it is chosen`)
    }
    expect(await choose(A_PRIVATE_NETWORK_NAME)).toBe(200)
    for (const host of [A_PRIVATE_NETWORK_NAME, `${A_PRIVATE_NETWORK_NAME}:443`]) {
      expectAnswered(await ask({ through: 'the second listener', host }), 'the second listener', `Host ${host}`)
    }
    expectRefused(await ask({ through: 'the second listener', host: `${A_PRIVATE_NETWORK_NAME}:${ownPort}` }), 'the second listener', `Host ${A_PRIVATE_NETWORK_NAME}:${ownPort}`)
    // No port and :443 are the second listener's alone: the door for other machines still refuses them.
    for (const host of [A_PRIVATE_NETWORK_NAME, `${A_PRIVATE_NETWORK_NAME}:443`]) {
      expectRefused(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host}`)
    }
  })

  it('9: refuses a name the office does not hold, even when it would stand for this machine, and does not look it up', async () => {
    theMachineHas([THE_NUMBER])
    // THE_RESOLVER says THE_NAME stands for THE_NUMBER, this machine's own. Nobody chose it, and no setting holds it.
    lookedUp.length = 0
    for (const listener of ['the door for other machines', 'the second listener'] as const) {
      for (const host of [`${THE_NAME}:${String(thePortOf(listener))}`, THE_NAME, `${THE_NAME}:443`]) {
        expectRefused(await ask({ through: listener, host }), listener, `Host ${host}`)
      }
    }
    expect(lookedUp, 'the check looked up the name a request used').toEqual([])
  })

  it('10: takes the host of the setting for other machines at the door for other machines', async () => {
    const port = String(thePortOf('the door for other machines'))
    const host = `${THE_SETTINGS_NAME}:${port}`
    expectRefused(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host} before the setting names it`)
    const was = process.env[THE_SETTING]
    process.env[THE_SETTING] = THE_SETTINGS_NAME
    try {
      expectAnswered(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host} while the setting names it`)
      expectAnswered(await ask({ through: 'the second listener', host: THE_SETTINGS_NAME }), 'the second listener', `Host ${THE_SETTINGS_NAME} while the setting names it`)
    } finally {
      if (was === undefined) delete process.env[THE_SETTING]
      else process.env[THE_SETTING] = was
    }
    expectRefused(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host} once the setting no longer names it`)
  })

  it('11: refuses a request with no Host the same way', async () => {
    for (const listener of EVERY_LISTENER) expectRefused(await askWithNoHost(listener), listener, 'a request with no Host')
  })
})

describe('this machine\'s own tailnet name is taken where the address for browsers is', () => {
  // A NAME ONCE READ IS KEPT FOR AS LONG AS THE PROCESS RUNS, so case 12 is the first case in this file that reads one,
  // and no case before it reads.
  it('12: holds no tailnet name until a read names one, and refuses it while the probe answers null', async () => {
    if (hostCheck === undefined) throw new Error('the Host check was not loaded')
    expect(askedForTheTailnetName, 'building and serving the app, or a request, asked for the tailnet name').toBe(0)
    const host = `${THE_TAILNET_NAME}:${String(thePortOf('the door for other machines'))}`
    expectRefused(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host} before any read`)
    expect(await readTheTailnetName(null)).toEqual([hostCheck.THE_TAILNET_NAME_WAS_NOT_READ])
    expect(askedForTheTailnetName).toBe(1)
    expectRefused(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host} after a read that found none`)
    expectRefused(await ask({ through: 'the second listener', host: THE_TAILNET_NAME }), 'the second listener', `Host ${THE_TAILNET_NAME} after a read that found none`)
  })

  it('13: takes this machine\'s tailnet name at the door for other machines with its port once the probe names it, written with a final dot', async () => {
    expect(await readTheTailnetName(aStatusNaming(THE_TAILNET_NAME))).toEqual([])
    const port = String(thePortOf('the door for other machines'))
    lookedUp.length = 0
    expectAnswered(await ask({ through: 'the door for other machines', host: `${THE_TAILNET_NAME}:${port}` }), 'the door for other machines', `Host ${THE_TAILNET_NAME}:${port}`)
    // With another port, or none, it is refused, as the door's other names are.
    for (const host of [`${THE_TAILNET_NAME}:${String(anotherPortThan('the door for other machines'))}`, THE_TAILNET_NAME, `${THE_TAILNET_NAME}:443`]) {
      expectRefused(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host}`)
    }
    expect(lookedUp, 'the check looked up the name a request used').toEqual([])
  })

  it('14: takes this machine\'s tailnet name at the second listener with no port and with :443, and refuses it with the socket\'s port', async () => {
    expect(await readTheTailnetName(aStatusNaming(THE_TAILNET_NAME))).toEqual([])
    for (const host of [THE_TAILNET_NAME, `${THE_TAILNET_NAME}:443`]) {
      expectAnswered(await ask({ through: 'the second listener', host }), 'the second listener', `Host ${host}`)
    }
    const host = `${THE_TAILNET_NAME}:${String(thePortOf('the second listener'))}`
    expectRefused(await ask({ through: 'the second listener', host }), 'the second listener', `Host ${host}`)
  })

  it('15: refuses this machine\'s tailnet name on the loopback listener, with its port, with none and with :443', async () => {
    expect(await readTheTailnetName(aStatusNaming(THE_TAILNET_NAME))).toEqual([])
    for (const host of [`${THE_TAILNET_NAME}:${String(thePortOf('the loopback listener'))}`, THE_TAILNET_NAME, `${THE_TAILNET_NAME}:443`]) {
      expectRefused(await ask({ through: 'the loopback listener', host }), 'the loopback listener', `Host ${host}`)
    }
    // CONTROL: the name is held, because the door for other machines takes it.
    const host = `${THE_TAILNET_NAME}:${String(thePortOf('the door for other machines'))}`
    expectAnswered(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host}`)
  })

  it('16: keeps the last tailnet name read when a later read finds none, says once that it failed, and takes the name a later read finds', async () => {
    if (hostCheck === undefined) throw new Error('the Host check was not loaded')
    const port = String(thePortOf('the door for other machines'))
    const atTheDoor = (name: string): Promise<Answer> => ask({ through: 'the door for other machines', host: `${name}:${port}` })
    expect(await readTheTailnetName(aStatusNaming(THE_TAILNET_NAME))).toEqual([])
    expect(await readTheTailnetName(null)).toEqual([hostCheck.THE_TAILNET_NAME_WAS_NOT_READ])
    expectAnswered(await atTheDoor(THE_TAILNET_NAME), 'the door for other machines', `Host ${THE_TAILNET_NAME}:${port} after a read that found none`)
    expect(await readTheTailnetName(aStatusNaming(ANOTHER_TAILNET_NAME))).toEqual([])
    expectAnswered(await atTheDoor(ANOTHER_TAILNET_NAME), 'the door for other machines', `Host ${ANOTHER_TAILNET_NAME}:${port}`)
    expectRefused(await atTheDoor(THE_TAILNET_NAME), 'the door for other machines', `Host ${THE_TAILNET_NAME}:${port} once another name is read`)
  })

  it('17: writes one line in the server\'s log for each refusal, naming the kind of its Host and its listener, and never the Host', async () => {
    if (hostCheck === undefined) throw new Error('the Host check was not loaded')
    const check = hostCheck
    const everyRefusalsLine = new Set(EVERY_KIND_OF_HOST.flatMap((kind) => EVERY_LISTENER.map((listener) => check.aRefusalsLogLine(kind, listener))))
    expect(everyRefusalsLine.size, 'two kinds or two listeners have the same line').toBe(EVERY_KIND_OF_HOST.length * EVERY_LISTENER.length)
    const doorsPort = String(thePortOf('the door for other machines'))
    const refused: readonly { kind: TheKindOfAHost; through: Listener; host: string | undefined; name: string | undefined }[] = [
      { kind: 'loopback', through: 'the loopback listener', host: `localhost:${String(anotherPortThan('the loopback listener'))}`, name: undefined },
      { kind: 'number', through: 'the door for other machines', host: `203.0.113.9:${doorsPort}`, name: '203.0.113.9' },
      { kind: 'number', through: 'the second listener', host: '[2001:db8::8]:443', name: '2001:db8::8' },
      { kind: 'name', through: 'the second listener', host: A_FOREIGN_NAME, name: A_FOREIGN_NAME },
      { kind: 'none', through: 'the door for other machines', host: undefined, name: undefined },
      { kind: 'none', through: 'the loopback listener', host: 'two words', name: undefined },
    ]
    for (const one of refused) {
      const what = one.host === undefined ? 'a request with no Host' : `Host ${one.host}`
      THE_LOG.clear()
      expectRefused(one.host === undefined ? await askWithNoHost(one.through) : await ask({ through: one.through, host: one.host }), one.through, what)
      await settle()
      const itsLines = THE_LOG.lines.filter((line) => everyRefusalsLine.has(theWordsOf(line)))
      expect(itsLines.map(theWordsOf), `${what} on ${one.through}`).toEqual([check.aRefusalsLogLine(one.kind, one.through)])
      for (const part of [one.host, one.name]) if (part !== undefined) expect(itsLines[0], `${what} on ${one.through}`).not.toContain(part)
    }
    // CONTROL: a request that is answered writes no such line.
    THE_LOG.clear()
    const host = `127.0.0.1:${String(thePortOf('the loopback listener'))}`
    expectAnswered(await ask({ through: 'the loopback listener', host }), 'the loopback listener', `Host ${host}`)
    await settle()
    expect(THE_LOG.lines.length, 'no line reached THE_LOG, so this case cannot read the log').toBeGreaterThan(0)
    expect(THE_LOG.lines.filter((line) => everyRefusalsLine.has(theWordsOf(line))).map(theWordsOf)).toEqual([])
  })

  /** The first label of a name: the text before its first dot. Of a tailnet name, it is that name's short name. */
  function theFirstLabelOf(name: string): string {
    const dot = name.indexOf('.')
    if (dot <= 0) throw new Error(`${name} has no label before a dot, so this file cannot work out its first label`)
    return name.slice(0, dot)
  }
  /** The short name of THE_TAILNET_NAME, as a machine on the tailnet may call this one. */
  const THE_SHORT_NAME = theFirstLabelOf(THE_TAILNET_NAME)
  /** The short name of ANOTHER_TAILNET_NAME. */
  const ANOTHER_SHORT_NAME = theFirstLabelOf(ANOTHER_TAILNET_NAME)

  it('21: takes this machine\'s short tailnet name at the door for other machines with its port once the probe names the full name', async () => {
    expect(await readTheTailnetName(aStatusNaming(THE_TAILNET_NAME))).toEqual([])
    const port = String(thePortOf('the door for other machines'))
    lookedUp.length = 0
    expectAnswered(await ask({ through: 'the door for other machines', host: `${THE_SHORT_NAME}:${port}` }), 'the door for other machines', `Host ${THE_SHORT_NAME}:${port}`)
    // With another port, or none, or :443, it is refused, as the full name is.
    for (const host of [`${THE_SHORT_NAME}:${String(anotherPortThan('the door for other machines'))}`, THE_SHORT_NAME, `${THE_SHORT_NAME}:443`]) {
      expectRefused(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host}`)
    }
    expect(lookedUp, 'the check looked up the name a request used').toEqual([])
  })

  it('22: takes this machine\'s short tailnet name at the second listener with no port and with :443, and refuses it with the socket\'s port', async () => {
    expect(await readTheTailnetName(aStatusNaming(THE_TAILNET_NAME))).toEqual([])
    for (const host of [THE_SHORT_NAME, `${THE_SHORT_NAME}:443`]) {
      expectAnswered(await ask({ through: 'the second listener', host }), 'the second listener', `Host ${host}`)
    }
    const host = `${THE_SHORT_NAME}:${String(thePortOf('the second listener'))}`
    expectRefused(await ask({ through: 'the second listener', host }), 'the second listener', `Host ${host}`)
  })

  it('23: refuses this machine\'s short tailnet name on the loopback listener, with its port, with none and with :443, each in one log line of the kind name', async () => {
    if (hostCheck === undefined) throw new Error('the Host check was not loaded')
    const check = hostCheck
    const everyRefusalsLine = new Set(EVERY_KIND_OF_HOST.flatMap((kind) => EVERY_LISTENER.map((listener) => check.aRefusalsLogLine(kind, listener))))
    expect(await readTheTailnetName(aStatusNaming(THE_TAILNET_NAME))).toEqual([])
    for (const host of [`${THE_SHORT_NAME}:${String(thePortOf('the loopback listener'))}`, THE_SHORT_NAME, `${THE_SHORT_NAME}:443`]) {
      THE_LOG.clear()
      expectRefused(await ask({ through: 'the loopback listener', host }), 'the loopback listener', `Host ${host}`)
      await settle()
      const itsLines = THE_LOG.lines.filter((line) => everyRefusalsLine.has(theWordsOf(line)))
      expect(itsLines.map(theWordsOf), `Host ${host} on the loopback listener`).toEqual([check.aRefusalsLogLine('name', 'the loopback listener')])
      expect(itsLines[0], `Host ${host} on the loopback listener`).not.toContain(THE_SHORT_NAME)
    }
    // CONTROL: the short name is held, because the door for other machines takes it.
    const host = `${THE_SHORT_NAME}:${String(thePortOf('the door for other machines'))}`
    expectAnswered(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host}`)
  })

  // A NAME ONCE READ IS KEPT FOR AS LONG AS THE PROCESS RUNS, so no case after case 12 can see the check hold no full
  // name at all. This case pins what a read that finds none does to the short name instead.
  it('24: takes no short name from a read that finds none, and follows the full name a later read finds', async () => {
    if (hostCheck === undefined) throw new Error('the Host check was not loaded')
    const port = String(thePortOf('the door for other machines'))
    const atTheDoor = (name: string): Promise<Answer> => ask({ through: 'the door for other machines', host: `${name}:${port}` })
    expect(await readTheTailnetName(aStatusNaming(THE_TAILNET_NAME))).toEqual([])
    expect(await readTheTailnetName(null)).toEqual([hostCheck.THE_TAILNET_NAME_WAS_NOT_READ])
    // While the probe answers null, a name no read found has no short name held, and the kept name keeps its own.
    expectRefused(await atTheDoor(ANOTHER_SHORT_NAME), 'the door for other machines', `Host ${ANOTHER_SHORT_NAME}:${port} while the probe answers null`)
    expectAnswered(await atTheDoor(THE_SHORT_NAME), 'the door for other machines', `Host ${THE_SHORT_NAME}:${port} after a read that found none`)
    expect(await readTheTailnetName(aStatusNaming(ANOTHER_TAILNET_NAME))).toEqual([])
    expectAnswered(await atTheDoor(ANOTHER_SHORT_NAME), 'the door for other machines', `Host ${ANOTHER_SHORT_NAME}:${port} once its full name is read`)
    expectRefused(await atTheDoor(THE_SHORT_NAME), 'the door for other machines', `Host ${THE_SHORT_NAME}:${port} once another name is read`)
    // The second listener follows it too.
    expectAnswered(await ask({ through: 'the second listener', host: ANOTHER_SHORT_NAME }), 'the second listener', `Host ${ANOTHER_SHORT_NAME} once its full name is read`)
    expectRefused(await ask({ through: 'the second listener', host: THE_SHORT_NAME }), 'the second listener', `Host ${THE_SHORT_NAME} once another name is read`)
  })

  it('25: refuses at the door for other machines a name only like the short name, and the first label of any other name the office holds', async () => {
    expect(await readTheTailnetName(aStatusNaming(THE_TAILNET_NAME))).toEqual([])
    theMachineHas([THE_NUMBER])
    expect(await choose(THE_NAME)).toBe(200)
    const port = String(thePortOf('the door for other machines'))
    // CONTROL: the short name and the address for browsers are taken, so a refusal below is about the name alone.
    for (const name of [THE_SHORT_NAME, THE_NAME]) {
      expectAnswered(await ask({ through: 'the door for other machines', host: `${name}:${port}` }), 'the door for other machines', `Host ${name}:${port}`)
    }
    for (const name of [`${THE_SHORT_NAME}s`, THE_SHORT_NAME.slice(0, -1), `${THE_SHORT_NAME}.another.example`, theFirstLabelOf(THE_NAME)]) {
      expectRefused(await ask({ through: 'the door for other machines', host: `${name}:${port}` }), 'the door for other machines', `Host ${name}:${port}`)
    }
    // Nor is the first label of the host the setting for other machines names.
    const was = process.env[THE_SETTING]
    process.env[THE_SETTING] = THE_SETTINGS_NAME
    try {
      const named = `${THE_SETTINGS_NAME}:${port}`
      expectAnswered(await ask({ through: 'the door for other machines', host: named }), 'the door for other machines', `Host ${named} while the setting names it`)
      const host = `${theFirstLabelOf(THE_SETTINGS_NAME)}:${port}`
      expectRefused(await ask({ through: 'the door for other machines', host }), 'the door for other machines', `Host ${host} while the setting names its full name`)
    } finally {
      if (was === undefined) delete process.env[THE_SETTING]
      else process.env[THE_SETTING] = was
    }
  })
})

describe('this machine\'s tailnet name is read from the status text tailscale writes', () => {
  function theNameIn(status: string): string | null {
    if (resources === undefined) throw new Error('the operating system layer was not loaded')
    return resources.ownTailnetNameIn(status)
  }

  it('18: gives the DNSName of Self with the final dot taken off, in lower case', () => {
    expect(theNameIn(aStatusNaming(THE_TAILNET_NAME))).toBe(THE_TAILNET_NAME)
    expect(theNameIn(JSON.stringify({ Self: { DNSName: 'This-Machine.A-Tailnet.Example.' } }))).toBe(THE_TAILNET_NAME)
    expect(theNameIn(JSON.stringify({ Self: { DNSName: THE_TAILNET_NAME } })), 'a name without the final dot').toBe(THE_TAILNET_NAME)
  })

  it('19: gives no name when the status has no Self, or an empty DNSName', () => {
    for (const status of [{ BackendState: 'NeedsLogin' }, { Self: null }, { Self: {} }, { Self: { DNSName: '' } }, { Self: { DNSName: '.' } }, { Self: { DNSName: 8 } }, [], null]) {
      expect(theNameIn(JSON.stringify(status)), JSON.stringify(status)).toBeNull()
    }
  })

  it('20: gives no name when the text is not JSON', () => {
    for (const text of ['', 'tailscale: command not found', '{"Self":']) expect(theNameIn(text), text).toBeNull()
  })
})
