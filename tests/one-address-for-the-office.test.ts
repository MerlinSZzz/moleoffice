// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE ADDRESS FOR THE OFFICE, SO ONE PAIRING COVERS IT (wave 13x, round 7).
 *
 * The owner opened the office at this machine's private-network name and at its private-network number. Both reach
 * the same server, but a browser keeps its pairing per address, so they paired twice. Now a page load that arrives at
 * another of this machine's own addresses is sent to the one address for browsers, which the person chooses on the
 * Settings page (src/server/lib/address-for-browsers.ts).
 *
 * ---------------------------------------------------------------------------------------
 * HOW THIS FILE STANDS IN FOR THE PRIVATE NETWORK, WITH NO NETWORK AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * The door is the product's own, opened with `serveTheAddressForOtherMachines` on 127.0.0.2, as
 * tests/this-machines-own-address-is-this-machine.test.ts opens it. The private-network number and name arrive at the
 * same socket and differ only in the Host header, so each request here names its Host. The probe's list of this
 * machine's own addresses is the one method replaced: it names THE_NUMBER, an address from the range kept for
 * documentation. The rule only compares a Host with that list, so it meets this number as it meets any of its own.
 *
 * What is proved:
 *   1. a page load by the number is sent to the chosen name, with its path and query, on the port it arrived on;
 *   2. an API call by the number is answered where it arrived, even when it asks for HTML;
 *   3. a page load at loopback is answered where it arrived, even when the probe names that loopback address;
 *   4. a forged Host header never becomes a target: a Host that is not this office's, and a Host that is this
 *      machine's number with another port, are refused with a coded refusal and sent nowhere
 *      (tests/a-request-that-names-another-host-is-refused.test.ts holds that rule);
 *   5. nothing is sent when nobody has chosen an address and .env names none;
 *   6. only the person chooses it, a written address must be a name or a number on its own, and every change is
 *      written down;
 *   7. in built mode, where the server itself serves the pages (as the live office does at its own port), a page
 *      load by the number is sent to the chosen name with its path and query. Cases 1 to 5 use tests/helpers.ts's
 *      apiApp(), which starts the server with `production: false`, where it serves no pages at all; case 7 builds
 *      its own app with `production: true` and a built page in a temporary folder, as tests/server-wiring.test.ts
 *      does. A development page server (Vite) never reaches this rule, and the Settings sentence says so;
 *   8. (round 7d) the chosen address is this machine's: a number that is not one of its own addresses is refused, a
 *      name that resolves to none of them is refused, a name that cannot be looked up now is refused with a 503 that
 *      says so, and in each case nothing is stored; this machine's own name and number are stored.
 *
 * NO NAME IS LOOKED UP ON THE NETWORK. The resolver is replaced for the whole file by THE_RESOLVER below, which knows
 * THE_NAME, A_FOREIGN_NAME and A_NAME_THAT_CANNOT_BE_LOOKED_UP and says ENOTFOUND for every other name.
 *
 * Three-run proof, mutations and their logs: the report of wave 13x round 7, logs under .logs/w7/.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { settingNamed } from '../src/config/settings.mjs'
import type { OsProbe } from '../src/server/lib/resources.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The door's own address, a second loopback address, as the other tests of this door use. */
const THE_DOORS_ADDRESS = '127.0.0.2'
/**
 * This machine's private-network number, as the probe names it here: an address from the range kept for
 * documentation, which the rule meets exactly as it meets a number from the private network.
 */
const THE_NUMBER = '198.51.100.8'
/** The name the person chooses, which is the office's one address for browsers. */
const THE_NAME = 'the-office.example'
/** A number that is not this machine's, from the range kept for documentation. */
const A_FOREIGN_NUMBER = '203.0.113.9'
/** A name that resolves, but to a number that is not this machine's. */
const A_FOREIGN_NAME = 'evil.example'
/** A name whose lookup fails as it does when the private network is down. */
const A_NAME_THAT_CANNOT_BE_LOOKED_UP = 'the-office-while-the-network-is-down.example'

/** What a name stands for here, in place of the network. */
async function THE_RESOLVER(name: string): Promise<readonly string[]> {
  if (name === THE_NAME) return [THE_NUMBER]
  if (name === A_FOREIGN_NAME) return [A_FOREIGN_NUMBER]
  const code = name === A_NAME_THAT_CANNOT_BE_LOOKED_UP ? 'EAI_AGAIN' : 'ENOTFOUND'
  throw Object.assign(new Error(`getaddrinfo ${code} ${name}`), { code })
}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'nib' }

/** What a browser sends when it opens a page. */
const A_PAGE_LOAD = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

let t: TestDb | undefined
let app: FastifyInstance | undefined
let door: Server | undefined
let resources: typeof import('../src/server/lib/resources.ts') | undefined

function theApp(): FastifyInstance {
  if (app === undefined) throw new Error('the app was not started, so there is nothing to ask')
  return app
}

function theDoor(): Server {
  if (door === undefined) throw new Error('the door was not opened, so there is nothing to ask')
  return door
}

function theDoorsPort(through: Server = theDoor()): number {
  return (through.address() as AddressInfo).port
}

/** Replace only the list of this machine's own addresses; every other answer is the real probe's. */
function theMachineHas(addresses: readonly string[]): void {
  if (resources === undefined) throw new Error('the operating system layer was not loaded')
  const probe = Object.create(resources.LINUX_PROBE) as OsProbe
  probe.ownAddresses = () => addresses
  resources.useOsProbe(probe)
}

async function choose(address: string | null, headers: Record<string, string> = AS_THE_PERSON): Promise<{ status: number; body: any }> {
  const reply = await theApp().inject({ method: 'POST', url: '/api/office/address-for-browsers', headers, payload: { address } })
  return { status: reply.statusCode, body: JSON.parse(reply.body) }
}

/** One request through the door (this file's own, unless another is named), with the Host and Accept headers it names. */
function ask(input: { path: string; host: string; accept?: string; headers?: Record<string, string>; door?: Server }): Promise<{ status: number; location: string | undefined; type: string | undefined; body: string }> {
  return new Promise((done, fail) => {
    const req = request(
      {
        host: THE_DOORS_ADDRESS,
        port: theDoorsPort(input.door),
        path: input.path,
        method: 'GET',
        // UNDER AN AGENT'S NAME, as the own-address test asks: a request from another machine that names nobody is
        // refused, and which address it was sent to is the question here, not who asked.
        headers: {
          'x-mole-office-workspace': 'default',
          'x-mole-office-actor-type': 'agent',
          'x-mole-office-actor-id': 'a-synthetic-caller',
          ...(input.accept === undefined ? {} : { accept: input.accept }),
          ...input.headers,
          host: input.host,
        },
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => { body += chunk })
        res.once('end', () => {
          const location = res.headers.location
          done({ status: res.statusCode ?? 0, location: typeof location === 'string' ? location : undefined, type: res.headers['content-type'], body })
        })
      },
    )
    req.once('error', fail)
    req.end()
  })
}

beforeAll(async () => {
  t = await freshDb()
  resources = await import('../src/server/lib/resources.ts')
  const { useANameResolver } = await import('../src/server/lib/address-for-browsers.ts')
  useANameResolver(THE_RESOLVER)
  app = (await apiApp()).app
  await app.ready()
  const { serveTheAddressForOtherMachines } = await import('../src/server/index.ts')
  door = await serveTheAddressForOtherMachines(app, 0, THE_DOORS_ADDRESS)
})

afterEach(async () => {
  resources?.useOsProbe(resources.LINUX_PROBE)
  if (app !== undefined) await choose(null)
})

afterAll(async () => {
  resources?.useOsProbe(resources.LINUX_PROBE)
  const { useANameResolver } = await import('../src/server/lib/address-for-browsers.ts')
  useANameResolver(null)
  if (door !== undefined) await new Promise<void>((done) => door?.close(() => done()))
  if (app !== undefined) await app.close()
  t?.close()
})

describe('a page load at another of this machine\'s addresses is sent to the one address for browsers', () => {
  it('1: a page load by the number is sent to the chosen name, keeping its path and query', async () => {
    theMachineHas([THE_NUMBER])
    expect((await choose(THE_NAME)).status).toBe(200)
    const answer = await ask({ path: '/records/abc123?tab=links&q=a%20b', host: `${THE_NUMBER}:${String(theDoorsPort())}`, accept: A_PAGE_LOAD })
    expect(answer.status).toBe(307)
    expect(answer.location).toBe(`http://${THE_NAME}:${String(theDoorsPort())}/records/abc123?tab=links&q=a%20b`)
  })

  it('2: an API call by the number is answered where it arrived, even when it asks for HTML', async () => {
    theMachineHas([THE_NUMBER])
    expect((await choose(THE_NAME)).status).toBe(200)
    for (const accept of [undefined, 'application/json', A_PAGE_LOAD]) {
      const answer = await ask({ path: '/api/access', host: `${THE_NUMBER}:${String(theDoorsPort())}`, accept })
      expect(answer.location, `GET /api/access with Accept ${String(accept)}`).toBeUndefined()
      expect(answer.status, `GET /api/access with Accept ${String(accept)}`).toBe(200)
    }
    // A script or a picture the page asks for is not a page load either.
    const script = await ask({ path: '/assets/index.js', host: `${THE_NUMBER}:${String(theDoorsPort())}`, accept: '*/*' })
    expect(script.location).toBeUndefined()
  })

  it('3: a page load at loopback is answered where it arrived, even when the probe names that address', async () => {
    // THE PROBE NAMES LOOPBACK HERE ON PURPOSE. The real probe leaves loopback out, so a list without it would let
    // the rule's own loopback check go unread. With 127.0.0.1 and ::1 on the list, only that check keeps them.
    theMachineHas([THE_NUMBER, '127.0.0.1', '::1', 'localhost'])
    expect((await choose(THE_NAME)).status).toBe(200)
    for (const host of [`127.0.0.1:${String(theDoorsPort())}`, `localhost:${String(theDoorsPort())}`, `[::1]:${String(theDoorsPort())}`]) {
      const answer = await ask({ path: '/', host, accept: A_PAGE_LOAD })
      expect(answer.location, `a page load at ${host}`).toBeUndefined()
    }
  })

  it('4: a forged Host header is refused, and never becomes a redirect target', async () => {
    theMachineHas([THE_NUMBER])
    expect((await choose(THE_NAME)).status).toBe(200)
    for (const host of ['evil.example', `evil.example:${String(theDoorsPort())}`, '203.0.113.9:80', `${THE_NUMBER}.evil.example`]) {
      const answer = await ask({ path: '/', host, accept: A_PAGE_LOAD })
      expect(answer.status, `a page load naming Host ${host}`).toBe(421)
      expect(JSON.parse(answer.body).code, `a page load naming Host ${host}`).toBe('hostIsNotThisOffice')
      expect(answer.location, `a page load naming Host ${host}`).toBeUndefined()
    }
    // A Host that IS this machine's number, but names another port and carries a path of its own, is refused the same
    // way: it is not this office's address, so it is sent nowhere and nothing of the header becomes a target.
    const forged = await ask({ path: '/settings', host: `${THE_NUMBER}:9999`, accept: A_PAGE_LOAD })
    expect(forged.status).toBe(421)
    expect(JSON.parse(forged.body).code).toBe('hostIsNotThisOffice')
    expect(forged.location).toBeUndefined()
    // An absolute URL in the request line is not a path. Its Host is this machine's number with no port, which names
    // port 80 and not the door's, so it is refused as well and sent nowhere.
    const absolute = await new Promise<{ status: number; location: string | undefined }>((done, fail) => {
      const req = request(
        {
          host: THE_DOORS_ADDRESS,
          port: theDoorsPort(),
          path: 'http://evil.example/',
          headers: { host: THE_NUMBER, accept: A_PAGE_LOAD, 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-synthetic-caller' },
        },
        (res) => {
          res.resume()
          res.once('end', () => done({ status: res.statusCode ?? 0, location: typeof res.headers.location === 'string' ? res.headers.location : undefined }))
        },
      )
      req.once('error', fail)
      req.end()
    })
    expect(absolute.status, `an absolute request line was answered ${String(absolute.status)}`).toBe(421)
    expect(absolute.location, `an absolute request line was sent to ${String(absolute.location)}`).toBeUndefined()
  })

  it('5: nothing is sent when nobody has chosen an address and .env names none', async () => {
    theMachineHas([THE_NUMBER])
    const reading = await theApp().inject({ method: 'GET', url: '/api/office/address-for-browsers', headers: AS_AN_AGENT })
    expect(reading.statusCode).toBe(200)
    // A test's environment names no address for other machines (tests/helpers.ts starts from a clean one).
    expect(JSON.parse(reading.body)).toMatchObject({ inForce: null, chosen: null, fromTheEnvironment: null })
    // The door's own port, so the Host check takes this machine's number and the page load reaches the redirect step.
    const answer = await ask({ path: '/', host: `${THE_NUMBER}:${String(theDoorsPort())}`, accept: A_PAGE_LOAD })
    expect(answer.status, 'the page load was refused, so it never reached the redirect step').not.toBe(421)
    expect(answer.location).toBeUndefined()
  })
})

describe('the address for browsers is the person\'s to choose', () => {
  it('6a: an agent is refused and nothing is changed', async () => {
    const refused = await choose(THE_NAME, AS_AN_AGENT)
    expect(refused.status).toBe(403)
    expect(String(refused.body.error)).toContain("Which address browsers are sent to is the owner's own setting")
    const reading = await theApp().inject({ method: 'GET', url: '/api/office/address-for-browsers', headers: AS_AN_AGENT })
    expect(JSON.parse(reading.body).chosen).toBeNull()
  })

  it('6b: a written address must be a name or a number on its own, and is stored in lower case', async () => {
    theMachineHas([THE_NUMBER])
    for (const bad of [`http://${THE_NAME}`, `${THE_NAME}:${String(settingNamed('MOLE_OFFICE_PORT').fallback)}`, `${THE_NAME}/x`, '0.0.0.0', '127.0.0.1', 'localhost', 'a name', '']) {
      const refused = await choose(bad)
      expect(refused.status, `the address ${JSON.stringify(bad)}`).toBe(400)
      expect(String(refused.body.error), `the address ${JSON.stringify(bad)}`).toContain('Nothing was changed.')
    }
    const stored = await choose('  The-Office.EXAMPLE ')
    expect(stored.status).toBe(200)
    expect(stored.body).toMatchObject({ inForce: THE_NAME, chosen: THE_NAME, fromTheEnvironment: null })
  })

  it('6c: every change is written down, with who made it, and the choice can be taken away', async () => {
    theMachineHas([THE_NUMBER])
    expect((await choose(THE_NAME)).status).toBe(200)
    expect((await choose(null)).status).toBe(200)
    const rows = t?.client.sqlite
      .prepare('SELECT actor_id, field, old_value, new_value FROM changes WHERE record_id = ? ORDER BY rowid')
      .all('setting:address-for-browsers') as { actor_id: string; field: string; old_value: string | null; new_value: string | null }[]
    expect(rows.slice(-2)).toEqual([
      { actor_id: THE_PERSON, field: 'the address browsers are sent to', old_value: null, new_value: THE_NAME },
      { actor_id: THE_PERSON, field: 'the address browsers are sent to', old_value: THE_NAME, new_value: null },
    ])
    const last = await theApp().inject({ method: 'GET', url: '/api/office/setting-changes', headers: AS_AN_AGENT })
    expect(JSON.parse(last.body).settings['address-for-browsers']).toMatchObject({ by: { id: THE_PERSON }, to: null })
  })
})

describe('the chosen address is this machine\'s, or it is not stored', () => {
  /** What the door reads back, as anybody may read it. */
  async function theChoice(): Promise<unknown> {
    const reading = await theApp().inject({ method: 'GET', url: '/api/office/address-for-browsers', headers: AS_AN_AGENT })
    return JSON.parse(reading.body).chosen
  }

  it('8a: a number that is not one of this machine\'s own addresses is refused in words, and nothing is stored', async () => {
    theMachineHas([THE_NUMBER])
    const refused = await choose(A_FOREIGN_NUMBER)
    expect(refused.status).toBe(400)
    expect(String(refused.body.error)).toContain(`"${A_FOREIGN_NUMBER}" is not one of this computer's own network addresses`)
    expect(String(refused.body.error)).toContain('Nothing was changed.')
    expect(await theChoice()).toBeNull()
  })

  it('8b: a name that resolves to none of this machine\'s addresses is refused in words, and nothing is stored', async () => {
    theMachineHas([THE_NUMBER])
    const refused = await choose(A_FOREIGN_NAME)
    expect(refused.status).toBe(400)
    expect(String(refused.body.error)).toContain(`The name "${A_FOREIGN_NAME}" stands for ${A_FOREIGN_NUMBER}, and none of that is this computer's own network address`)
    expect(String(refused.body.error)).toContain('Nothing was changed.')
    // A name that does not resolve at all is not stored either.
    expect((await choose('nobody-has-this-name.example')).status).toBe(503)
    expect(await theChoice()).toBeNull()
  })

  it('8c: a name that cannot be looked up now is refused with a 503 that says so, and nothing is stored', async () => {
    theMachineHas([THE_NUMBER])
    const refused = await choose(A_NAME_THAT_CANNOT_BE_LOOKED_UP)
    expect(refused.status).toBe(503)
    expect(String(refused.body.error)).toContain(`The name "${A_NAME_THAT_CANNOT_BE_LOOKED_UP}" could not be looked up just now (EAI_AGAIN)`)
    expect(String(refused.body.error)).toContain('This happens when the private network is down.')
    expect(String(refused.body.error)).toContain('Nothing was changed.')
    expect(await theChoice()).toBeNull()
  })

  it('8d: this machine\'s own name and its own number are stored', async () => {
    theMachineHas([THE_NUMBER])
    expect(await choose(THE_NAME)).toMatchObject({ status: 200, body: { chosen: THE_NAME, inForce: THE_NAME } })
    expect(await choose(THE_NUMBER)).toMatchObject({ status: 200, body: { chosen: THE_NUMBER, inForce: THE_NUMBER } })
  })
})

describe('in built mode, where the office serves its own pages, a page load by the number is sent on', () => {
  /** The built page, in a folder this case makes and removes. Its title is what says this server served it. */
  const THE_BUILT_PAGE = '<!doctype html><title>The built page of a test office</title>'
  let webDir: string | undefined
  let built: FastifyInstance | undefined
  let builtDoor: Server | undefined

  beforeAll(async () => {
    webDir = mkdtempSync(join(tmpdir(), 'mole-office-one-address-web-'))
    writeFileSync(join(webDir, 'index.html'), THE_BUILT_PAGE)
    const { buildApp, serveTheAddressForOtherMachines } = await import('../src/server/index.ts')
    built = (await buildApp({ production: true, webDir, webAppUrl: 'http://localhost:5173', logLevel: false })).app
    await built.ready()
    builtDoor = await serveTheAddressForOtherMachines(built, 0, THE_DOORS_ADDRESS)
  })

  afterAll(async () => {
    if (builtDoor !== undefined) await new Promise<void>((done) => builtDoor?.close(() => done()))
    if (built !== undefined) await built.close()
    if (webDir !== undefined) rmSync(webDir, { recursive: true, force: true })
  })

  it('7: the built server serves its page where it is not sent, and sends a page load by the number to the chosen name', async () => {
    if (builtDoor === undefined) throw new Error('the built server\'s door was not opened')
    const port = String(theDoorsPort(builtDoor))
    theMachineHas([THE_NUMBER])
    expect((await choose(THE_NAME)).status).toBe(200)
    // CONTROL: this server is in built mode. At loopback, which is never sent, the page load is the built page itself.
    const here = await ask({ path: '/records/abc123', host: `${THE_DOORS_ADDRESS}:${port}`, accept: A_PAGE_LOAD, door: builtDoor })
    expect(here.status).toBe(200)
    expect(here.type).toContain('text/html')
    expect(here.body).toBe(THE_BUILT_PAGE)
    // The same page load by this machine's number is sent to the chosen name, keeping its path and query.
    const sent = await ask({ path: '/records/abc123?tab=links&q=a%20b', host: `${THE_NUMBER}:${port}`, accept: A_PAGE_LOAD, door: builtDoor })
    expect(sent.status).toBe(307)
    expect(sent.location).toBe(`http://${THE_NAME}:${port}/records/abc123?tab=links&q=a%20b`)
    expect(sent.body).not.toContain('The built page')
  })
})
