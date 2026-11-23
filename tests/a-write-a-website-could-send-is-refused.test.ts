// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WRITE A WEBSITE COULD SEND IS REFUSED BEFORE ANY DOOR (wave 13s, line 13s, SEC-3).
 *
 * While an office's key window is open, the office takes a request from this machine with no key as the person. A page
 * on any website the person has open can make the browser send two kinds of request without asking the office first: a
 * POST with no body, and a GET from an image tag. Neither can carry a header of the office's own or a JSON body without
 * a preflight, and the office answers no preflight from a website elsewhere. So a request carries the office's mark when
 * it has a header whose name starts with `x-mole-office-`, or a Content-Type whose media type is application/json, and
 * every request that changes something must carry it. Anything else is refused with the coded refusal
 * writeWithoutTheOfficesMark, status 403, before any door runs.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH REQUESTS MUST CARRY THE MARK
 * ---------------------------------------------------------------------------------------
 *
 *   - Every method but GET, HEAD and OPTIONS.
 *   - A GET, HEAD or OPTIONS whose route declares that it changes something, always or by its query. GET
 *     /api/messages/groups declares it only when `move` is asked for.
 *
 * What is proved:
 *   1. with the key window open, a POST to /api/import with no body, no Content-Type and no header of the office's is
 *      refused, and nothing the import would have changed is changed;
 *   2. with the key window open, GET /api/messages/groups?move=1, sent as an image tag sends it, is refused, and so is
 *      its HEAD, and the read points are as they were; the same GET without move is answered, and the same GET with the
 *      headers the office's own page sends still moves them;
 *   3. POST, PUT, PATCH and DELETE with no mark are each refused before the door, at the counting door and at a real
 *      door whose own refusal would be something else;
 *   4. a body of text/plain, of application/x-www-form-urlencoded or of multipart/form-data, and a Content-Type of
 *      `text/plain; application/json`, are refused with this code and not 415;
 *   5. `application/json; charset=utf-8` and `Application/JSON` pass and reach the door;
 *   6. a POST with no body and one `x-mole-office-*` header and nothing else passes and reaches the door;
 *   7. GET, HEAD and OPTIONS with no mark are not refused at a door that declares no change;
 *   8. a preflight from a website elsewhere, asking for an `x-mole-office-*` header or for a JSON content type, gets no
 *      access-control-allow-origin, and a page on this machine's own address gets one;
 *   9. with the key window closed, a POST with no body, the person's key in its cookie and no mark is refused;
 *  10. a request whose Host the Host check refuses gets the Host check's answer, and no line of this refusal;
 *  11. a refusal writes one line in the server's log, naming the method and the route's pattern, and the line holds
 *      neither the URL's path or query nor any header's value;
 *  12. the refusal is said in English and in Chinese, from the word files;
 *  13. a request made inside the office's own process, which no listener carried, passes without the mark.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THIS FILE STANDS IN FOR A WEBSITE
 * ---------------------------------------------------------------------------------------
 *
 * The office is the app tests/helpers.ts builds, listening on 127.0.0.1, as
 * tests/a-request-that-names-another-host-is-refused.test.ts opens it. Every request that expects the refusal is sent
 * over that real socket, with the headers a browser would send for a page on another site and no others; a request
 * made in the office's own process passes by name, and case 13 is the one case that makes one. The counting door this
 * file adds takes every method and counts each request that reaches it. It stands for any door that changes something.
 *
 * The key window is one-way: once closed it stays closed. So the cases that need it open run first, case 9 closes it
 * with the person's key, as tests/the-press-closes-the-window.test.ts does, and the cases after it run with it closed.
 * Vitest runs the cases in the order they are written.
 *
 * The server's logger is on and writes into THE_LOG, which is how cases 10 and 11 read the line a refusal writes.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { settings } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

/** The refusal's code. */
const THE_CODE = 'writeWithoutTheOfficesMark'

/** The door this file adds, which counts every request that reaches it, by every method. */
const THE_COUNTING_DOOR = '/a-door-that-counts-who-reaches-it'
let reachedTheCountingDoor = 0

/** A website the person has open, which is not this office. */
const A_WEBSITE = 'https://a-website.example'

/** What a browser sends as `accept` for an image tag. */
const AN_IMAGE = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'

/** What a browser sends for a POST with no body from a page on another site: no Content-Type, and nothing of the office's. */
const A_WEBSITES_POST = { origin: A_WEBSITE, accept: '*/*' }

/** The headers the office's own page sends for the person while the key window is open: who asks and in which project. */
function thePersonsPage(): Record<string, string> {
  return { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
}

/** The person's headers with JSON, as tests/import-api.test.ts reads the import's plan. */
const THE_PERSON_WITH_JSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/**
 * THE PERSON'S KEY, read from the file the office made at first run beside the database, as
 * tests/the-press-closes-the-window.test.ts reads it. It is never printed or asserted on.
 */
function thePersonsKey(): string {
  const held = JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { person?: unknown }
  if (typeof held.person !== 'string') throw new Error('the office made no person key beside the database')
  return held.person
}

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
let words: typeof import('../src/shared/i18n.ts') | undefined
let theRule: typeof import('../src/server/lib/a-write-a-website-could-send.ts') | undefined
let exportRoot: string | undefined

function theApp(): FastifyInstance {
  if (app === undefined) throw new Error('the app was not started, so there is nothing to ask')
  return app
}

function thePort(): number {
  return (theApp().server.address() as AddressInfo).port
}

/** The listener's own Host: the name and port the Host check takes on the loopback listener. */
function ownHost(): string {
  return `127.0.0.1:${String(thePort())}`
}

/** The methods whose request says its length, 0 when it has no body, as a browser sends them. */
const A_METHOD_WITH_A_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

interface Answer {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
  json: Record<string, unknown> | undefined
}

/**
 * One request through the loopback listener, sent over a real socket, with exactly the headers given and the
 * listener's own Host unless another is named. A request of a method that may carry a body says its length, 0 when it
 * has none, as a browser does, so Node does not send it in chunks.
 */
function ask(input: { method: string; path: string; headers?: Record<string, string>; body?: string; host?: string }): Promise<Answer> {
  const body = input.body ?? ''
  return new Promise((done, fail) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: thePort(),
        path: input.path,
        method: input.method,
        headers: {
          ...(input.headers ?? {}),
          ...(A_METHOD_WITH_A_BODY.has(input.method) || body !== '' ? { 'content-length': String(Buffer.byteLength(body)) } : {}),
          host: input.host ?? ownHost(),
        },
      },
      (res) => {
        let said = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => { said += chunk })
        res.once('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body: said, json: parsed(said) }))
      },
    )
    req.once('error', fail)
    req.end(body === '' ? undefined : body)
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
function theEnglish(): string {
  if (words === undefined) throw new Error('the words were not loaded')
  return words.createI18n('en').t('server.writeWithoutTheOfficesMark')
}

/** The answer is this refusal: 403, its code, and its English. */
function expectRefused(answer: Answer, what: string): void {
  expect(answer.status, `${what}: ${answer.body}`).toBe(403)
  expect(answer.json, what).toEqual({ error: theEnglish(), code: THE_CODE, values: {} })
}

/** The answer is not this refusal: whatever the door said, it is not this code. */
function expectNotRefused(answer: Answer, what: string): void {
  expect(answer.json?.code, `${what}: ${answer.body}`).not.toBe(THE_CODE)
  expect(answer.status, `${what}: ${answer.body}`).not.toBe(403)
}

/** The counting door's own answer: 200. */
function expectReached(answer: Answer, what: string): void {
  expect(answer.status, `${what}: ${answer.body}`).toBe(200)
}

/** The office's one installation row, which says whether the key window is closed. */
function theWindowIsClosed(): boolean {
  const row = t?.client.sqlite.prepare('SELECT window_closed_at FROM installation WHERE only_row = 1').get() as { window_closed_at: string | null } | undefined
  if (row === undefined) throw new Error('the office holds no installation row, so this file cannot say whether the key window is closed')
  return row.window_closed_at !== null
}

beforeAll(async () => {
  t = await freshDb()
  words = await import('../src/shared/i18n.ts')
  theRule = await import('../src/server/lib/a-write-a-website-could-send.ts')
  // THE APP AS tests/helpers.ts BUILDS IT, with the logger on and writing into THE_LOG.
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({
    production: false,
    webDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    webAppUrl: settings().webAddress,
    logLevel: 'info',
    logStream: THE_LOG,
  })).app
  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    url: THE_COUNTING_DOOR,
    handler: () => {
      reachedTheCountingDoor += 1
      return { reached: reachedTheCountingDoor }
    },
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
})

afterAll(async () => {
  if (app !== undefined) await app.close()
  if (exportRoot !== undefined) rmSync(exportRoot, { recursive: true, force: true })
  t?.close()
})

describe('with the key window open, a write a website could send is refused before any door', () => {
  it('1: refuses a POST to /api/import with no body, no Content-Type and no header of the office\'s, and changes nothing', async () => {
    if (t === undefined) throw new Error('the office was not made')
    const db = t
    expect(theWindowIsClosed(), 'the key window is closed, so this case does not ask what it says').toBe(false)
    // THE IMPORT HAS SOMETHING TO DO, as tests/import-api.test.ts sets it up: an archive holds a record as it was, and
    // the record has changed since, so an import would put the old title back.
    exportRoot = mkdtempSync(join(tmpdir(), 'mole-office-a-website-s-import-'))
    const exportLib = await import('../src/server/lib/export.ts')
    exportLib.useExportRoot(exportRoot)
    const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
    const made = db.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Tray clamp', data: { context: 'the hand' }, actor: HUMAN }).id
    exportLib.writeExport(exportRoot)
    db.api.patchRecord(made, { title: 'Tray clamp, edited since the export' }, HUMAN)
    const theTitle = (): string => (db.client.sqlite.prepare('SELECT title FROM records WHERE id = ?').get(made) as { title: string }).title
    const thePlan = async (): Promise<string[]> => {
      const reply = await theApp().inject({ method: 'GET', url: '/api/import', headers: THE_PERSON_WITH_JSON })
      expect(reply.statusCode, reply.body).toBe(200)
      return (JSON.parse(reply.body) as { rows: { region: string; key: string; action: string }[] }).rows.map((row) => `${row.region} ${row.key} ${row.action}`)
    }
    const before = await thePlan()
    expect(before, 'the import would change nothing, so this case cannot show that nothing changed').toContain(`records ${made} update`)

    expectRefused(await ask({ method: 'POST', path: '/api/import', headers: A_WEBSITES_POST }), 'a POST to /api/import a website sent')

    expect(theTitle(), 'the import ran: the record has its old title back').toBe('Tray clamp, edited since the export')
    expect(await thePlan(), 'the import ran: its plan is not what it was').toEqual(before)
  })

  it('2: refuses GET /api/messages/groups?move=1 sent by an image tag, and the read points stay; the page\'s own GET still moves them', async () => {
    if (t === undefined) throw new Error('the office was not made')
    const db = t
    // AN AGENT REGISTERED WITH THE PERSON'S KEY, as tests/the-press-closes-the-window.test.ts registers one, so it holds
    // a proved key and does not stop case 9 from closing the window. In-process, so the rule does not reach it.
    const registered = await theApp().inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { ...THE_PERSON_WITH_JSON, 'x-mole-office-key': thePersonsKey() },
      payload: { handle: 'a-group-member', name: 'A Group Member' },
    })
    expect(registered.statusCode, registered.body).toBe(201)
    const agent = db.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('a-group-member') as { id: string } | undefined
    if (agent === undefined) throw new Error('the registered agent has no registry row')
    // A GROUP OF THE PERSON AND THE AGENT, with one message in it and no read point of the person's, as
    // tests/a-hand-over-moves-only-the-read-points-of-groups-with-news.test.ts opens one. A move moves a point in a group
    // that gained a message or held none.
    const { openAGroup } = await import('../src/server/lib/groups.ts')
    const person = { kind: 'person' as const, id: THE_PERSON }
    const member = { kind: 'agent' as const, id: agent.id }
    const group = openAGroup({ workspaceId: 'default', name: 'The greenhouse', openedBy: person, because: 'To plan the greenhouse.', members: [person, member].map((who) => ({ who, because: 'Works in the greenhouse.' })) }).id
    db.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Greenhouse aired', data: { body: 'The greenhouse was aired.', toGroup: group }, actor: { type: 'human', id: THE_PERSON } })
    const thePoints = (): unknown[] =>
      db.client.sqlite.prepare("SELECT rowid, reader_id, at FROM conversation_reads WHERE pair = ? AND reader_kind = 'person' ORDER BY rowid").all(group)
    const before = thePoints()

    const anImage = { accept: AN_IMAGE, referer: `${A_WEBSITE}/a-page` }
    expectRefused(await ask({ method: 'GET', path: '/api/messages/groups?move=1', headers: anImage }), 'an image tag asking to move the read points')
    const head = await ask({ method: 'HEAD', path: '/api/messages/groups?move=1', headers: anImage })
    expect(head.status, 'the HEAD of the same GET').toBe(403)
    expect(thePoints(), 'a refused GET moved a read point').toEqual(before)

    // THE DECLARATION DEPENDS ON THE QUERY: without move, the same image GET only reads, and is answered.
    const onlyReads = await ask({ method: 'GET', path: '/api/messages/groups', headers: anImage })
    expect(onlyReads.status, onlyReads.body).toBe(200)
    expect(thePoints(), 'a GET that only reads moved a read point').toEqual(before)

    // CONTROL: the office's own page sends its headers, and its GET moves the person's point in the group.
    const fromThePage = await ask({ method: 'GET', path: '/api/messages/groups?move=1', headers: { ...thePersonsPage(), accept: 'application/json' } })
    expect(fromThePage.status, fromThePage.body).toBe(200)
    expect(thePoints(), 'the page\'s own GET did not move the read point').not.toEqual(before)
  })

  it('3: refuses POST, PUT, PATCH and DELETE with no mark before the door, whatever the door would have said', async () => {
    const reached = reachedTheCountingDoor
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expectRefused(await ask({ method, path: THE_COUNTING_DOOR, headers: A_WEBSITES_POST }), `${method} at the counting door`)
    }
    expect(reachedTheCountingDoor, 'a refused request reached the counting door').toBe(reached)
    // REAL DOORS, each of which would refuse this request in its own words, or not at all, if it were reached.
    for (const [method, path] of [
      ['POST', '/api/records'],
      ['PUT', '/api/home-layout'],
      ['PATCH', '/api/records/no-such-record'],
      ['DELETE', '/api/links/no-such-link'],
    ] as const) {
      expectRefused(await ask({ method, path, headers: A_WEBSITES_POST }), `${method} ${path}`)
    }
  })

  it('4: refuses a body a form or a no-cors fetch can send with this code, not 415', async () => {
    const reached = reachedTheCountingDoor
    const BOUNDARY = 'a-boundary'
    const bodies: readonly { type: string; body: string }[] = [
      { type: 'text/plain', body: '{"kind":"problem"}' },
      { type: 'application/x-www-form-urlencoded', body: 'kind=problem' },
      { type: `multipart/form-data; boundary=${BOUNDARY}`, body: `--${BOUNDARY}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nproblem\r\n--${BOUNDARY}--\r\n` },
      { type: 'text/plain; application/json', body: '{"kind":"problem"}' },
    ]
    for (const { type, body } of bodies) {
      for (const path of [THE_COUNTING_DOOR, '/api/records']) {
        expectRefused(await ask({ method: 'POST', path, headers: { ...A_WEBSITES_POST, 'content-type': type }, body }), `a ${type} body to ${path}`)
      }
    }
    expect(reachedTheCountingDoor, 'a refused request reached the counting door').toBe(reached)
  })

  it('5: lets a JSON content type with a parameter, or in capitals, through to the door', async () => {
    for (const type of ['application/json; charset=utf-8', 'Application/JSON']) {
      const reached = reachedTheCountingDoor
      expectReached(await ask({ method: 'POST', path: THE_COUNTING_DOOR, headers: { 'content-type': type }, body: '{}' }), `a ${type} body`)
      expect(reachedTheCountingDoor, `a ${type} body did not reach the counting door`).toBe(reached + 1)
    }
  })

  it('6: lets a POST with no body and one header of the office\'s and nothing else through to the door', async () => {
    const reached = reachedTheCountingDoor
    expectReached(await ask({ method: 'POST', path: THE_COUNTING_DOOR, headers: { 'x-mole-office-workspace': 'default' } }), 'a POST with one x-mole-office- header')
    expect(reachedTheCountingDoor, 'the POST did not reach the counting door').toBe(reached + 1)
  })

  it('7: does not refuse GET, HEAD or OPTIONS with no mark at a door that declares no change', async () => {
    for (const method of ['GET', 'HEAD']) {
      const reached = reachedTheCountingDoor
      const answer = await ask({ method, path: THE_COUNTING_DOOR, headers: { accept: AN_IMAGE } })
      expectNotRefused(answer, `${method} at the counting door`)
      expect(answer.status, `${method} at the counting door: ${answer.body}`).toBe(200)
      expect(reachedTheCountingDoor, `${method} did not reach the counting door`).toBe(reached + 1)
    }
    // AN OPTIONS IS ANSWERED BY THE CORS REGISTRATION'S OWN HOOK, which runs after this rule, so whether it reaches the
    // door is that registration's to say. This rule's part is that it does not refuse it.
    expectNotRefused(await ask({ method: 'OPTIONS', path: THE_COUNTING_DOOR, headers: { accept: AN_IMAGE } }), 'OPTIONS at the counting door')
  })

  it('8: gives a preflight from a website elsewhere no access-control-allow-origin, for an x-mole-office- header or for JSON', async () => {
    const preflight = (origin: string, asks: string): Promise<Answer> =>
      ask({ method: 'OPTIONS', path: '/api/import', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': asks } })
    for (const asks of ['x-mole-office-workspace', 'content-type']) {
      const answer = await preflight(A_WEBSITE, asks)
      expect(answer.headers['access-control-allow-origin'], `a preflight from ${A_WEBSITE} asking for ${asks}`).toBeUndefined()
    }
    // CONTROL: a page on this machine's own address is answered, so the missing header above is about the website.
    const here = `http://${ownHost()}`
    const answer = await preflight(here, 'x-mole-office-workspace')
    expect(answer.headers['access-control-allow-origin'], `a preflight from ${here}`).toBe(here)
  })
})

describe('with the key window closed, the rule holds the same way', () => {
  it('9: refuses a POST with no body, the person\'s key in its cookie and no mark', async () => {
    // THE PRESS, as tests/the-press-closes-the-window.test.ts presses it: the person's headers with the key, on this
    // machine's own listener.
    const pressed = await ask({ method: 'POST', path: '/api/office/key-window/close', headers: { ...THE_PERSON_WITH_JSON, 'x-mole-office-key': thePersonsKey() } })
    expect(pressed.status, `the press did not close the window: ${pressed.body}`).toBe(200)
    expect(theWindowIsClosed(), 'the press answered, but the window is still open').toBe(true)
    const reached = reachedTheCountingDoor
    const withTheKey = { ...A_WEBSITES_POST, cookie: `mole-office-key=${thePersonsKey()}` }
    expectRefused(await ask({ method: 'POST', path: THE_COUNTING_DOOR, headers: withTheKey }), 'a POST with the key in its cookie and no mark')
    expectRefused(await ask({ method: 'POST', path: '/api/import', headers: withTheKey }), 'a POST to /api/import with the key in its cookie and no mark')
    // CONTROL, FROM A PAGE OF THIS OFFICE. A request whose Origin is a website's is refused before any door whatever it
    // carries (src/server/lib/an-origin-that-is-not-this-office.ts), so the control is sent with this office's own
    // Origin. Without the mark it is still refused by this rule, and with one header of the office's it reaches the door.
    const fromThisOffice = { ...withTheKey, origin: `http://${ownHost()}` }
    expectRefused(await ask({ method: 'POST', path: THE_COUNTING_DOOR, headers: fromThisOffice }), 'the same POST from a page of this office, with no mark')
    expect(reachedTheCountingDoor, 'a refused request reached the counting door').toBe(reached)
    expectReached(await ask({ method: 'POST', path: THE_COUNTING_DOOR, headers: { ...fromThisOffice, 'x-mole-office-workspace': 'default' } }), 'the same POST from a page of this office, with the mark')
    expect(reachedTheCountingDoor, 'the POST with the mark did not reach the counting door').toBe(reached + 1)
  })

  it('10: answers a request whose Host the Host check refuses with the Host check\'s answer, not this one', async () => {
    if (words === undefined || theRule === undefined) throw new Error('the words or the rule were not loaded')
    const rule = theRule
    const port = thePort()
    const reached = reachedTheCountingDoor
    THE_LOG.clear()
    const answer = await ask({ method: 'POST', path: THE_COUNTING_DOOR, headers: A_WEBSITES_POST, host: `evil.example:${String(port)}` })
    expect(answer.status, answer.body).toBe(421)
    expect(answer.json).toEqual({ error: words.createI18n('en').t('server.hostIsNotThisOffice', { port }), code: 'hostIsNotThisOffice', values: { port } })
    expect(reachedTheCountingDoor).toBe(reached)
    await settle()
    expect(THE_LOG.lines.length, 'no line reached THE_LOG, so this case cannot read the log').toBeGreaterThan(0)
    expect(THE_LOG.lines.map(theWordsOf), 'the rule wrote its line for a request the Host check refused').not.toContain(rule.aRefusalsLogLine('POST', THE_COUNTING_DOOR))
  })

  it('11: writes one line in the server\'s log for a refusal, naming the method and the route\'s pattern, and nothing the request said', async () => {
    if (theRule === undefined) throw new Error('the rule was not loaded')
    const rule = theRule
    const said = {
      origin: 'https://a-website-s-origin.example',
      referer: 'https://a-website-s-origin.example/a-page-it-was-on',
      'user-agent': 'a-made-up-browser/1.0',
      accept: 'image/a-made-up-type',
      cookie: 'a-made-up-cookie=a-cookie-s-value',
    }
    const theLinesOf = (method: string, pattern: string): string[] => THE_LOG.lines.filter((line) => theWordsOf(line) === rule.aRefusalsLogLine(method, pattern))
    for (const { method, path, pattern, parts } of [
      { method: 'DELETE', path: '/api/links/a-link-nobody-made?because=a-query-s-value', pattern: '/api/links/:id', parts: ['a-link-nobody-made', 'a-query-s-value'] },
      { method: 'POST', path: '/api/records?kind=a-kind-in-the-query', pattern: '/api/records', parts: ['a-kind-in-the-query'] },
    ]) {
      THE_LOG.clear()
      expectRefused(await ask({ method, path, headers: said }), `${method} ${path}`)
      await settle()
      const itsLines = theLinesOf(method, pattern)
      expect(itsLines, `${method} ${path} wrote no line, or more than one, of its refusal`).toHaveLength(1)
      for (const part of [...parts, ownHost(), ...Object.values(said)]) expect(itsLines[0], `${method} ${path}`).not.toContain(part)
    }
    // CONTROL: a request that is answered writes no such line.
    THE_LOG.clear()
    expectReached(await ask({ method: 'POST', path: THE_COUNTING_DOOR, headers: { 'content-type': 'application/json' }, body: '{}' }), 'a POST with JSON')
    await settle()
    expect(THE_LOG.lines.length, 'no line reached THE_LOG, so this case cannot read the log').toBeGreaterThan(0)
    expect(theLinesOf('POST', THE_COUNTING_DOOR)).toEqual([])
  })

  it('12: says the refusal in English and in Chinese, from the word files', async () => {
    if (words === undefined) throw new Error('the words were not loaded')
    const english = theEnglish()
    const chinese = words.createI18n('zh').t('server.writeWithoutTheOfficesMark')
    expect(english, 'the English is the key, so no English word was written').not.toBe('server.writeWithoutTheOfficesMark')
    expect(english.trim()).not.toBe('')
    expect(chinese, 'the Chinese is the English, so no Chinese word was written').not.toBe(english)
    expect(chinese).toMatch(/\p{Script=Han}/u)
    // The refusal a website's request gets says the English.
    const refused = await ask({ method: 'POST', path: THE_COUNTING_DOOR, headers: A_WEBSITES_POST })
    expectRefused(refused, 'a POST a website sent')
  })

  it('13: lets a request made in the office\'s own process through without the mark', async () => {
    const reached = reachedTheCountingDoor
    const reply = await theApp().inject({ method: 'POST', url: THE_COUNTING_DOOR })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reachedTheCountingDoor, 'the in-process POST did not reach the counting door').toBe(reached + 1)
  })
})
