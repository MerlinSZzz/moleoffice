// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HEADER HALF IS A HEADER THE OFFICE READS, AND ITS VALUE IS WRITTEN NOWHERE (wave 13s, line 13s, SEC-2).
 *
 * A browser proves the person with two halves of one device key. The page sends the header half in its own header on
 * every call it makes to the office. A header whose name carries the product's name must be on the server's list of
 * the headers it reads, or a request that carries it is refused as carrying a misspelt header. The header half was not
 * on that list, so every request that carried it was refused with 400, a paired browser's reads and writes among them.
 *
 * The header half is half of a key, so its value is kept as the key's is. It is in no line of the server's log, in no
 * refusal's words or values, and in no stored row, the call log and the usage counts among them. A refusal may name
 * the header, and never its value.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. a read and a write that carry the header half beside a key are answered, and not refused as carrying a header
 *      the office does not read;
 *   2. a near miss of the header's name is refused, and the refusal names the header and not its value;
 *   3. a made-up header half, sent on requests that are answered and on requests each check refuses, is in no line of
 *      the server's log, in no answer, and in no row of any table.
 *
 * ---------------------------------------------------------------------------------------
 * HOW
 * ---------------------------------------------------------------------------------------
 *
 * The app listens on a real socket on 127.0.0.1, because the checks of the halves, of the Host and of the Origin read
 * the listener, and an injected request is on none. Requests go through node:http, so that one of them can name
 * another Host. The key beside the half is the person's, from the test office's key file. With a key in the key
 * header the halves are not read, so only the header's name is in question.
 *
 * The half is made up by this file. No half and no key is printed: a check says only whether it held, and a count
 * says how many held one.
 */

import { randomBytes } from 'node:crypto'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { settings } from '../src/config/settings.mjs'
import { DEVICE_HALF_COOKIE, DEVICE_HALF_HEADER, KEY_HEADER } from '../src/config/key-header.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

/** The person's headers and no key, as a page of this office sends them. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** A header half no office gave, made up here. Printed nowhere. */
const A_MADE_UP_HALF = `a-made-up-header-half-${randomBytes(12).toString('hex')}`

/** A cookie half no office gave, made up here. */
const A_MADE_UP_COOKIE_HALF = `a-made-up-cookie-half-${randomBytes(12).toString('hex')}`

/** A near miss of the header half's name, as a hand that typed it might send it. */
const A_NEAR_MISS = `${DEVICE_HALF_HEADER}s`

/** A page on another site, as its Origin says. */
const A_FOREIGN_ORIGIN = 'https://evil.example'

/** A Host that names another site. */
const A_FOREIGN_HOST = 'not-this-office.example'

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

/** Give the log and the call log a moment to finish before they are read. */
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 50))

let t: TestDb | undefined
let app: FastifyInstance | undefined
let port = 0

beforeAll(async () => {
  t = await freshDb()
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({
    production: false,
    webDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    webAppUrl: settings().webAddress,
    logLevel: 'info',
    logStream: THE_LOG,
  })).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  port = (app.server.address() as AddressInfo).port
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

interface AnAnswer {
  status: number
  /** The answer's body, whole. */
  body: string
  /** The answer's refusal code, when it is a refusal that has one. */
  code: string | undefined
}

/** One request to the loopback listener over a real socket, naming this listener as its Host unless told otherwise. */
function send(input: { method: 'GET' | 'PATCH'; path: string; headers: Record<string, string>; body?: string; host?: string }): Promise<AnAnswer> {
  return new Promise((done, fail) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: input.path,
        method: input.method,
        headers: { ...input.headers, host: input.host ?? `127.0.0.1:${String(port)}` },
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          body += chunk
        })
        res.once('end', () => {
          let code: string | undefined
          try {
            const parsed = JSON.parse(body) as { code?: unknown }
            code = typeof parsed.code === 'string' ? parsed.code : undefined
          } catch {
            code = undefined
          }
          done({ status: res.statusCode ?? 0, body, code })
        })
      },
    )
    req.once('error', fail)
    req.end(input.body)
  })
}

/** The person, proved by their key, with the made-up header half beside it. */
function thePersonWithTheHalf(): Record<string, string> {
  return { ...THE_PERSON, [KEY_HEADER]: thePersonsKeyHeader()[KEY_HEADER]!, [DEVICE_HALF_HEADER]: A_MADE_UP_HALF }
}

/** The read and the write of whether the office map moves. Each reads the project's header, which checks every header's name. */
const readTheScene = (headers: Record<string, string>, host?: string): Promise<AnAnswer> =>
  send({ method: 'GET', path: '/api/office/scene-settings', headers, ...(host === undefined ? {} : { host }) })
const changeTheScene = (headers: Record<string, string>): Promise<AnAnswer> =>
  send({ method: 'PATCH', path: '/api/office/scene-settings', headers, body: JSON.stringify({ motion: true }) })

/** How many rows the call log holds. */
function theCallRows(): number {
  if (t === undefined) throw new Error('the test office was not made')
  return (t.client.sqlite.prepare('SELECT count(*) AS n FROM api_calls').get() as { n: number }).n
}

/**
 * Every table of the test office that holds a row in which this value appears as text. The one full-text index is left
 * out, because it stores no text of its own to read back; its own tables are read.
 */
function theTablesThatHold(value: string): string[] {
  if (t === undefined) throw new Error('the test office was not made')
  const sqlite = t.client.sqlite
  const tables = (
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE 'CREATE VIRTUAL TABLE%'").all() as { name: string }[]
  ).map((one) => one.name)
  return tables.filter((name) =>
    (sqlite.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}"`).all() as unknown[]).some((row) => JSON.stringify(row).includes(value)),
  )
}

describe('the header half', () => {
  it('is read on a read and on a write beside a key, and not refused as a header the office does not read', async () => {
    // A REFUSAL OF AN UNREAD HEADER IS A 400, and the person's key makes either act the person's, so 200 is the answer.
    expect((await readTheScene(thePersonWithTheHalf())).status, 'a read carrying the header half beside the person\'s key').toBe(200)
    expect((await changeTheScene(thePersonWithTheHalf())).status, 'a write carrying the header half beside the person\'s key').toBe(200)
  })

  it('refuses a near miss of its name, and the refusal names the header and not its value', async () => {
    const headers: Record<string, string> = { ...THE_PERSON, [KEY_HEADER]: thePersonsKeyHeader()[KEY_HEADER]!, [A_NEAR_MISS]: A_MADE_UP_HALF }
    const refused = await readTheScene(headers)
    expect(refused.status, 'a near miss of the header half\'s name').toBe(400)
    expect(refused.body, 'the refusal does not name the header it did not read').toContain(A_NEAR_MISS)
    expect(refused.body.includes(A_MADE_UP_HALF), 'the refusal holds the value of the header it did not read').toBe(false)
  })

  it('is in no line of the log, in no answer, and in no row of any table, whether the request is answered or refused', async () => {
    THE_LOG.clear()
    const callsBefore = theCallRows()
    const answers: [string, AnAnswer][] = [
      ['a read beside the person\'s key', await readTheScene(thePersonWithTheHalf())],
      ['a write beside the person\'s key', await changeTheScene(thePersonWithTheHalf())],
      ['a near miss of the header\'s name', await readTheScene({ ...THE_PERSON, [KEY_HEADER]: thePersonsKeyHeader()[KEY_HEADER]!, [A_NEAR_MISS]: A_MADE_UP_HALF })],
      ['the header half alone', await changeTheScene({ ...THE_PERSON, [DEVICE_HALF_HEADER]: A_MADE_UP_HALF })],
      [
        'the header half beside a cookie half no office gave',
        await changeTheScene({ ...THE_PERSON, cookie: `${DEVICE_HALF_COOKIE}=${A_MADE_UP_COOKIE_HALF}`, [DEVICE_HALF_HEADER]: A_MADE_UP_HALF }),
      ],
      ['a page on another site', await changeTheScene({ ...thePersonWithTheHalf(), origin: A_FOREIGN_ORIGIN })],
      ['a Host that names another site', await readTheScene(thePersonWithTheHalf(), A_FOREIGN_HOST)],
    ]
    await settle()

    // EACH CHECK A REQUEST MEETS FIRST WAS MET, so the value went past each kind of refusal, and past an answer.
    expect(answers.map(([what, one]) => [what, one.status, one.code ?? null]), 'what each request was answered').toEqual([
      ['a read beside the person\'s key', 200, null],
      ['a write beside the person\'s key', 200, null],
      ['a near miss of the header\'s name', 400, null],
      ['the header half alone', 401, 'oneHalfOfADeviceKey'],
      ['the header half beside a cookie half no office gave', 401, null],
      ['a page on another site', 403, 'originIsNotThisOffice'],
      ['a Host that names another site', 421, 'hostIsNotThisOffice'],
    ])

    // NO ANSWER HOLDS IT, the words and the values of a refusal among them.
    expect(answers.filter(([, one]) => one.body.includes(A_MADE_UP_HALF)).map(([what]) => what), 'the answers that hold the header half').toEqual([])
    expect(answers.filter(([, one]) => one.body.includes(A_MADE_UP_COOKIE_HALF)).map(([what]) => what), 'the answers that hold the cookie half').toEqual([])

    // NO LINE OF THE LOG HOLDS IT, the line for each request and each refusal's own line among them.
    expect(THE_LOG.lines.length, 'no line reached the log, so this case cannot read it').toBeGreaterThan(0)
    expect(THE_LOG.lines.filter((line) => line.includes(A_MADE_UP_HALF)).length, 'lines of the log that hold the header half').toBe(0)
    expect(THE_LOG.lines.filter((line) => line.includes(A_MADE_UP_COOKIE_HALF)).length, 'lines of the log that hold the cookie half').toBe(0)

    // NO STORED ROW HOLDS IT, the call log and the usage counts among them.
    expect(theCallRows(), 'the call log gained no row, so this case cannot read it').toBeGreaterThan(callsBefore)
    expect(theTablesThatHold(A_MADE_UP_HALF), 'the tables that hold the header half').toEqual([])
    expect(theTablesThatHold(A_MADE_UP_COOKIE_HALF), 'the tables that hold the cookie half').toEqual([])
  })
})
