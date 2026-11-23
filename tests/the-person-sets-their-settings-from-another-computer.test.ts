// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON SETS THEIR OWN SETTINGS FROM THEIR OTHER COMPUTER, AND NOBODY ELSE THERE DOES. A login made on the
 * person's other computer had to come back to this one to be set, and now, by a decision, the settings the person is
 * already proved for there are done there too. The doors that read and
 * write the person's office keys and the sandboxes' logins declare `thePersonMayFromAnotherComputer`. The summons
 * mail's settings were among them until the mail left the office for the mail tool. The mail
 * tool's own settings came back as a read the office passes on to the person.
 * `thePersonMayAskFromThere` in src/server/lib/reach.ts is the rule; lib/changed-from-another-computer.ts says each
 * change made that way to the person.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. From the product's own second listener, with a paired device's key, the person reads and sets a sandbox login and an
 *      office key, and clears the login again. Each change is said to them as a line from the office, naming what
 *      changed and never a value.
 *   2. The same doors refuse anybody else there, with the ordinary refusal, and nothing is written: a claim with no
 *      key, and a key that proves nobody.
 *   3. A change made on this computer is not said: the person made it at the machine.
 *   4. GET /api/access leaves the person's own settings off the list of what they may not do from there, and keeps them on
 *      everybody else's, so the person's page and the rule say one thing.
 *   5. A door that is not encrypted is not widened, even for the person's key: the private network's proxy and a door on the
 *      private network's own address are encrypted, and nothing else is (`anEncryptedDoor`). A real request with the person's
 *      key, stamped as if it had arrived on a home network's door, is not let through (`thePersonMayAskFromThere`).
 *   6. The widening is declared on those seven doors, the four push doors, the thirteen doors of the person's own decisions
 *      the ten terminal doors, the private sign-in doors, and the read of the mail tool's own
 *      settings through the office and the three presses that change them, and on no other, so it cannot
 *      spread by a copied declaration. The terminal doors joined on point (d) of a decision, wave 13u round 14: from
 *      another computer, with their key, the person reads, types into, resizes and closes a terminal, and the view's
 *      own keeping doors go with them. Opening a terminal and starting the holder stay on this
 *      computer;
 *      tests/a-terminal-is-typed-into-from-another-computer.test.ts is what the terminal doors do from there. The read
 *      of the mail tool's own settings through the office joined on a decision.
 *      tests/the-mail-tools-state-is-read-through-the-office.test.ts is what it does from there. The person's three
 *      presses on those settings joined with it; tests/the-mail-tools-settings-are-changed-through-the-office.test.ts
 *      is what they do from there.
 *   7. It asks for the person's key itself: a keyless claim to be the person, from a machine the office trusts, is refused at the same
 *      doors and writes nothing, although the one-version window counts such a claim elsewhere; and GET /api/access
 *      keeps the doors on that caller's list. The inspector's refusal of run TO24fVURElIR measured the first version
 *      answering such a claim 200.
 *
 * ---------------------------------------------------------------------------------------
 * REAL LISTENERS, A HOME OF ITS OWN, AND MADE-UP LOGINS
 * ---------------------------------------------------------------------------------------
 *
 * The second listener is `listenForOtherMachines` out of src/server/index.ts, the door the private network's proxy
 * passes requests through, as tests/two-devices-under-one-name-both-bind.test.ts drives it. The device is paired
 * through the credential flow's own doors and confirmed on this computer. HOME is a scratch folder, because the
 * sandboxes' logins live under it. Every login and address here is made up, and no assertion quotes a token.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of run TO24fVURElIR, which added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the widening taken out of the hook: case 1 goes red;
 *   - the person's proof left out of the widening: case 2 goes red;
 *   - the encryption check left out of the widening: case 5 goes red;
 *   - anEncryptedDoor answering true for every door: case 5 goes red;
 *   - the line to the person left out of the set door: case 1 goes red;
 *   - the proved person's list left as everybody's in GET /api/access: case 4 goes red;
 *   - the window counted in the widening, as the first version did: case 7 goes red.
 */

import { PRIVATE_LOGIN_ROUTES } from '../src/shared/private-sandbox-login.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ApiRoute } from '../src/server/api/kinds.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const A_MADE_UP_LOGIN = 'not-a-real-login-5813'
const ANOTHER_MADE_UP_LOGIN = 'not-a-real-login-2134'
/** The line the office writes, and its first words. */
const THE_LINE = 'A setting was changed from another computer'

/** The person's headers on this computer, with no key: the one-version window answers them here. */
const THE_PERSON_HERE = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** What the browser on the person's other computer sends: a device's key makes it theirs, so the claim says `agent`. */
const theOtherComputer = (key: string | null): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-made-up-laptop',
  ...(key === null ? {} : { 'x-mole-office-key': key }),
})

let t: TestDb
let app: FastifyInstance
let routes: () => readonly ApiRoute[] = () => []
let thisMachine = ''
let anotherMachine = ''
let otherMachines: Server
let home = ''
let secrets = ''
let deviceKey = ''
const previousHome = process.env['HOME']

async function ask(where: string, method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(`${where}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  let parsed: any = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return { status: res.status, body: parsed, text }
}

/** The office's lines to the person about a setting changed from another computer, oldest first. */
async function theLinesToThem(): Promise<{ id: string; said: string }[]> {
  const read = await ask(thisMachine, 'GET', '/api/records?kind=message&shape=full', THE_PERSON_HERE)
  expect(read.status, read.text.slice(0, 300)).toBe(200)
  const records = (read.body?.records ?? []) as { id: string; data: { body?: string; saidInFull?: string; to?: { kind: string; id: string }[] } }[]
  return records
    .filter((one) => one.data.body === THE_LINE && (one.data.to ?? []).some((to) => to.kind === 'person' && to.id === THE_TEST_OFFICES_OWNER.id))
    .map((one) => ({ id: one.id, said: String(one.data.saidInFull ?? '') }))
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'mole-office-settings-from-there-'))
  process.env['HOME'] = home
  const template = JSON.parse(readFileSync(join(REPO, 'sandboxes', 'mole-office-dev', 'sandbox.json'), 'utf8')) as { secrets: { hostFile: string } }
  secrets = template.secrets.hostFile.replace(/^~(?=\/)/, home)
  expect(secrets.startsWith(home + sep), `${secrets} is not inside this test's home`).toBe(true)
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  routes = built.listApiRoutes
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`

  // THE PERSON'S OTHER COMPUTER, PAIRED: it asks through the credential flow's own door and is confirmed by the person on this computer.
  const asked = await ask(thisMachine, 'POST', '/api/office/visitors', THE_PERSON_HERE, { device: 'A made-up laptop' })
  expect(asked.status, asked.text.slice(0, 300)).toBe(201)
  deviceKey = String(asked.body.token)
  const confirmed = await ask(thisMachine, 'POST', `/api/office/visitors/${String(asked.body.credential.id)}/confirm`, THE_PERSON_HERE, {})
  expect(confirmed.status, confirmed.text.slice(0, 300)).toBe(200)
})

afterAll(async () => {
  await new Promise<void>((done) => {
    otherMachines.close(() => {
      done()
    })
  })
  await app.close()
  t.close()
  if (previousHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = previousHome
  if (home !== '') rmSync(home, { recursive: true, force: true })
})

describe('the person, from their other computer', () => {
  it('1: reads and sets a sandbox login and an office key, and each change is said to them', async () => {
    const before = new Set((await theLinesToThem()).map((one) => one.id))
    const read = await ask(anotherMachine, 'GET', '/api/office/sandbox-logins', theOtherComputer(deviceKey))
    expect(read.status, read.text.slice(0, 300)).toBe(200)

    const set = await ask(anotherMachine, 'POST', '/api/office/sandbox-logins/set', theOtherComputer(deviceKey), { name: 'OPENCODE_API_KEY', value: A_MADE_UP_LOGIN })
    expect(set.status, set.text.slice(0, 300)).toBe(200)
    expect(readFileSync(secrets, 'utf8')).toContain(`OPENCODE_API_KEY=${A_MADE_UP_LOGIN}\n`)
    expect(set.text).not.toContain(A_MADE_UP_LOGIN)

    const key = await ask(anotherMachine, 'POST', '/api/office/keys/set', theOtherComputer(deviceKey), { provider: 'moonshot', value: ANOTHER_MADE_UP_LOGIN })
    expect(key.status, key.text.slice(0, 300)).toBe(200)
    expect(key.text).not.toContain(ANOTHER_MADE_UP_LOGIN)

    const cleared = await ask(anotherMachine, 'POST', '/api/office/sandbox-logins/clear', theOtherComputer(deviceKey), { name: 'OPENCODE_API_KEY' })
    expect(cleared.status, cleared.text.slice(0, 300)).toBe(200)
    expect(readFileSync(secrets, 'utf8')).not.toContain('OPENCODE_API_KEY=')

    // THREE CHANGES, THREE LINES, each naming what changed and no value. Compared as a set: lines written within one
    // second carry one stamp, and the list does not promise an order between them.
    const lines = (await theLinesToThem()).filter((one) => !before.has(one.id))
    expect(lines.map((one) => one.said.split(', from another computer.')[0]).sort()).toEqual(
      [
        "The sandboxes' login OPENCODE_API_KEY was set",
        "The office's moonshot key was set",
        "The sandboxes' login OPENCODE_API_KEY was cleared",
      ].sort(),
    )
    for (const one of lines) {
      expect(one.said).not.toContain(A_MADE_UP_LOGIN)
      expect(one.said).not.toContain(ANOTHER_MADE_UP_LOGIN)
      expect(one.said).not.toContain('example.test')
    }
  })

  it('2: refuses the same doors to anybody else at the other computer, and writes nothing', async () => {
    const before = existsSync(secrets) ? readFileSync(secrets, 'utf8') : null
    const lines = (await theLinesToThem()).length
    for (const key of [null, 'a-key-that-proves-nobody-0000000000000000000000000000000000000000']) {
      const read = await ask(anotherMachine, 'GET', '/api/office/sandbox-logins', theOtherComputer(key))
      expect(read.status, `${String(key)}: ${read.text.slice(0, 200)}`).toBe(403)
      const set = await ask(anotherMachine, 'POST', '/api/office/sandbox-logins/set', theOtherComputer(key), { name: 'OPENCODE_API_KEY', value: A_MADE_UP_LOGIN })
      expect(set.status, `${String(key)}: ${set.text.slice(0, 200)}`).toBe(403)
      expect(set.text).toContain('works on the computer Mole Office is running on')
    }
    expect(existsSync(secrets) ? readFileSync(secrets, 'utf8') : null).toEqual(before)
    expect((await theLinesToThem()).length).toBe(lines)
  })

  it('3: says nothing about a change made on this computer', async () => {
    const lines = (await theLinesToThem()).length
    const set = await ask(thisMachine, 'POST', '/api/office/sandbox-logins/set', THE_PERSON_HERE, { name: 'OPENCODE_API_KEY', value: A_MADE_UP_LOGIN })
    expect(set.status, set.text.slice(0, 300)).toBe(200)
    expect((await theLinesToThem()).length).toBe(lines)
  })

  it('4: GET /api/access leaves the person\'s own settings off their list from there, and keeps them on anybody else\'s', async () => {
    const routesOf = (body: any): string[] => ((body?.caller?.refusedHere ?? []) as { routes: string[] }[]).flatMap((one) => one.routes)
    const their = await ask(anotherMachine, 'GET', '/api/access', theOtherComputer(deviceKey))
    expect(their.status, their.text.slice(0, 300)).toBe(200)
    const theirs = await ask(anotherMachine, 'GET', '/api/access', theOtherComputer(null))
    expect(theirs.status, theirs.text.slice(0, 300)).toBe(200)
    for (const route of ['GET /api/office/sandbox-logins', 'POST /api/office/sandbox-logins/set', 'POST /api/office/keys/set']) {
      expect(routesOf(their.body), `${route} is listed as refused to them`).not.toContain(route)
      expect(routesOf(theirs.body), `${route} is not listed as refused to somebody unproved`).toContain(route)
    }
    // AND ONLY THOSE: an act kept on this machine for everybody stays on the person's list too.
    expect(routesOf(their.body)).toContain('POST /api/office/visitors/:id/confirm')
  })

  it('5: widens no door that is not encrypted, even for the person\'s key', async () => {
    const { anEncryptedDoor, thePersonMayAskFromThere } = await import('../src/server/lib/reach.ts')
    // THE TWO ENCRYPTED DOORS, and every other one. Documentation and private-network addresses, none of them real.
    // The private-network ones are built from their numbers, because the address scan refuses one written out.
    const onTheNetwork = [100, 101, 5, 6].join('.')
    const anotherOnTheNetwork = [100, 101, 5, 7].join('.')
    expect(anEncryptedDoor('a proxy on this computer', '127.0.0.1')).toBe(true)
    expect(anEncryptedDoor('the caller', onTheNetwork)).toBe(true)
    expect(anEncryptedDoor('the caller', `::ffff:${anotherOnTheNetwork}`)).toBe(true)
    expect(anEncryptedDoor('the caller', 'fd7a:115c:a1e0::5')).toBe(true)
    expect(anEncryptedDoor('the caller', '192.0.2.10')).toBe(false)
    expect(anEncryptedDoor('the caller', '198.51.100.7')).toBe(false)
    expect(anEncryptedDoor('the caller', '203.0.113.40')).toBe(false)
    expect(anEncryptedDoor('the caller', '127.0.0.1')).toBe(false)
    expect(anEncryptedDoor(undefined, onTheNetwork)).toBe(false)

    // A REAL REQUEST WITH THE PERSON'S KEY, stamped as if it had come through a door on a home network's address. The route is
    // on a server of the test's own, because the product's app takes no route after it is ready; the rule it calls,
    // the key it reads and the database behind them are the product's.
    const { stampArrival } = await import('../src/server/lib/http.ts')
    const probe = Fastify()
    probe.get('/probe/:door', async (req) => {
      const door = (req.params as { door: string }).door
      stampArrival(req.raw, 'another machine', door === 'proxy' ? 'a proxy on this computer' : 'the caller')
      if (door === 'home') Object.defineProperty(req.socket, 'localAddress', { value: '192.0.2.10', configurable: true })
      return { widened: thePersonMayAskFromThere(req, { because: 'acts-on-this-machine', act: 'Setting a made-up thing', thePersonMayFromAnotherComputer: true }) }
    })
    await probe.ready()
    try {
      const through = async (door: string, key: string | null): Promise<boolean> => {
        const res = await probe.inject({ method: 'GET', url: `/probe/${door}`, headers: theOtherComputer(key) })
        expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
        return (res.json() as { widened: boolean }).widened
      }
      expect(await through('proxy', deviceKey), 'the person\'s key through the private network\'s proxy is not let through').toBe(true)
      expect(await through('proxy', null), 'a claim with no key is let through').toBe(false)
      expect(await through('home', deviceKey), 'the person\'s key through a door on a home network is let through').toBe(false)
    } finally {
      await probe.close()
    }
  })

  it('7: asks for the person\'s key itself: a keyless claim to be the person from a trusted machine is refused, and writes nothing', async () => {
    // A MACHINE THE PERSON TRUSTS, written as the trusted list's own press writes it, and their name claimed from it with no key.
    const TRUSTED = '198.51.100.9'
    const { trustThisMachine } = await import('../src/server/lib/trustedmachines.ts')
    trustThisMachine(TRUSTED, null, 'a press', 'the test trusted this machine', null)
    const theirNameWithNoKey = { ...THE_PERSON_HERE, 'x-forwarded-for': TRUSTED }
    // THE WINDOW IS OPEN, so the claim would count as the person at an ordinary person-only act; that is what makes this case
    // mean something.
    const window = await ask(thisMachine, 'GET', '/api/office/key-window', THE_PERSON_HERE)
    expect(window.body?.open, window.text.slice(0, 200)).toBe(true)

    const before = existsSync(secrets) ? readFileSync(secrets, 'utf8') : null
    const lines = (await theLinesToThem()).length
    const set = await ask(anotherMachine, 'POST', '/api/office/sandbox-logins/set', theirNameWithNoKey, { name: 'OPENCODE_API_KEY', value: ANOTHER_MADE_UP_LOGIN })
    expect(set.status, set.text.slice(0, 200)).toBe(403)
    const key = await ask(anotherMachine, 'POST', '/api/office/keys/set', theirNameWithNoKey, { provider: 'moonshot', value: ANOTHER_MADE_UP_LOGIN })
    expect(key.status, key.text.slice(0, 200)).toBe(403)
    expect(existsSync(secrets) ? readFileSync(secrets, 'utf8') : null).toEqual(before)
    expect((await theLinesToThem()).length).toBe(lines)

    // AND THE PERSON'S LIST SAYS THE SAME: the doors stay on this caller's list of what it may not do from there.
    const access = await ask(anotherMachine, 'GET', '/api/access', theirNameWithNoKey)
    const refused = ((access.body?.caller?.refusedHere ?? []) as { routes: string[] }[]).flatMap((one) => one.routes)
    expect(refused).toContain('POST /api/office/sandbox-logins/set')
    expect(refused).toContain('POST /api/office/keys/set')
  })

  // AND THE FOUR PUSH DOORS, BY TWO DECISIONS: the person allows notifications on the device they are on, which is
  // mostly not this computer
  // (tests/a-summons-tells-every-device-the-person-allowed.test.ts). AND THE
  // THIRTEEN DOORS OF THE PERSON'S OWN DECISIONS, BY A DECISION: the person's decisions are theirs wherever they make
  // them (tests/the-person-makes-their-decisions-from-another-computer.test.ts). AND THE TEN
  // TERMINAL DOORS, BY POINT (D) OF A DECISION: the doors one terminal's view asks, the one reading of several terminals
  // beside one terminal's stream, and not the press that opens a terminal, the one that starts the holder or the one
  // that names a terminal.
  it('6: is declared on the seven settings doors, the four push doors, the thirteen doors of the person\'s decisions, the ten terminal doors, the private sign-in doors and the mail tool\'s settings read and changed through the office, and on no other', () => {
    const declared = routes()
      .filter((one) => one.keptHere?.thePersonMayFromAnotherComputer === true)
      .map((one) => `${one.method} ${one.path}`)
    expect(declared.sort()).toEqual([
      ...PRIVATE_LOGIN_ROUTES.map(({ method, path }) => `${method} /api${path}`),
      'DELETE /api/roles/elevation/:handle',
      'GET /api/office/keys',
      'GET /api/office/mail-tool/state',
      'GET /api/office/push',
      'GET /api/office/sandbox-logins',
      'POST /api/implementation/:id/accept',
      'POST /api/office/held-keys/:id/revoke',
      'POST /api/office/held-keys/:id/revoke/undo',
      'POST /api/office/keys/set',
      'POST /api/office/keys/test',
      'POST /api/office/mail-tool/account',
      'POST /api/office/mail-tool/addresses',
      'POST /api/office/mail-tool/test',
      'POST /api/office/owner',
      'POST /api/office/push/devices',
      'POST /api/office/push/devices/remove',
      'POST /api/office/push/test',
      'POST /api/office/sandbox-logins/clear',
      'POST /api/office/sandbox-logins/set',
      'POST /api/office/sandbox-logins/test',
      'POST /api/office/trusted-machines/:id/remove',
      'POST /api/office/visitors/:id/end',
      'POST /api/participants/agent/:id/retire',
      'POST /api/planning/intents/:id/commit',
      'POST /api/planning/proposals/:id/apply',
      'POST /api/records/:id/revisions/:seq/revoke',
      'POST /api/roles/card/:handle',
      'POST /api/roles/elevation/:handle',
      'GET /api/terminals',
      'GET /api/terminals/:id/keeping',
      'GET /api/terminals/:id/last-line',
      'GET /api/terminals/:id/stream',
      'GET /api/terminals/stream',
      'POST /api/terminals/:id/close',
      'POST /api/terminals/:id/input',
      'POST /api/terminals/:id/keep-my-line',
      'POST /api/terminals/:id/resize',
      'PUT /api/terminals/:id/keeping',
    ].sort())
  })
})
