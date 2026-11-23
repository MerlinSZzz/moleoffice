// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST PRESS BESIDE EACH SANDBOX LOGIN SAYS WHAT THE LOGIN'S PROVIDER ANSWERED, AND NEVER THE LOGIN.
 * The door is POST /api/office/sandbox-logins/test in src/server/api/sandbox-logins.ts, and the probes are
 * src/server/lib/sandbox-login-tests.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   · Six names have a probe, each at its provider's own address in the provider router's table
 *     (src/config/provider-router.mjs): DEEPSEEK_API_KEY, OPENCODE_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY,
 *     CODEX_API_KEY and ANTHROPIC_API_KEY. Each sends its one request with the login in its one header, and reads the
 *     answer as one of five outcomes: works, refused, limit, no clear answer, and no test known.
 *   · Refused is a 401 only. Limit is a 429 on every probe, DeepSeek's 402, DeepSeek's is_available false and
 *     OpenRouter's limit_remaining at or below 0. The reset time comes only from a retry-after of whole seconds. Any
 *     other status, a redirect, a failed send and no answer in 20 s are no clear answer, with the status or with none.
 *   · A 200 is works. Credit is said to be checked only for DeepSeek's is_available true, OpenRouter's limit_remaining
 *     above 0 and an answered Go request.
 *   · DeepSeek's balances are shown only where the currency is three capital letters and the total a plain decimal.
 *   · The names the templates declare that have no probe answer "no test known" and send nothing.
 *   · Only the person pressing it themselves may press it. An agent, with its key or without, and a secretary, raised
 *     or carrying the person's words, are refused, and so are a name no template declares and a declared name the file
 *     does not set. A refused press sends nothing and writes nothing.
 *   · A second press inside 30 s answers the first result with its read time and sends nothing; after 30 s the login
 *     is tested again. Setting or clearing the login drops its result.
 *   · Each press that sent the login writes one act on the ledger key setting:sandbox-login-tests, with who, which name,
 *     when and the outcome, and never the login or a balance.
 *   · The login is in no reply, log line, change row, record, api_calls row, office file, console line or environment
 *     variable afterwards, not even where the provider answered with words that hold it.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE PROVIDERS ARE MADE UP
 * ---------------------------------------------------------------------------------------
 *
 * No real provider is called and nothing here points at the office on 28787. The test starts its own made-up provider,
 * an HTTP server on a free port of this machine that answers what each case queues. `fetch` is replaced with a stand-in
 * that keeps what the code sent (the address, the method, the headers and the body) and carries a request to a provider
 * address in the router's table on to the made-up provider. Any other address is refused by the stand-in and never
 * leaves the process. So the production code has no address of its own to be pointed somewhere else.
 *
 * THE 20 S LIMIT IS TESTED WITH FAKE TIMERS. Node 22 builds AbortSignal.timeout on the timers module's own setTimeout,
 * taken when that module loads, so a faked setTimeout cannot fire it. The case puts a stand-in for AbortSignal.timeout
 * in its place, built on the faked setTimeout, checks that the code asked it for 20000 ms, and moves the clock by
 * 19999 ms and then by 1 ms. Every other case fakes only the clock, and moves it on by a minute or more, so the 30 s
 * result one case leaves is never what the next case reads.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOME FOLDER IS THIS TEST'S OWN
 * ---------------------------------------------------------------------------------------
 *
 * The templates name the logins file under `~`, so HOME is pointed at a scratch folder before anything is asked, and the
 * file is checked to be inside it before it is written. Every login here is made up for this run: "made-up-", the
 * name, and random hex.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { FOR_THE_PERSON, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { NARROWED_BY_PERMISSION } from '../src/shared/disclosure.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_ROUTED_PROVIDERS } from '../src/config/provider-router.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_DOOR = '/api/office/sandbox-logins/test'
const THE_LEDGER_KEY = 'setting:sandbox-login-tests'

/** Random hex for this run, so a login found anywhere afterwards can only have come from this test. */
const THIS_RUN = randomBytes(6).toString('hex')
const aMadeUpLogin = (name: string, also = ''): string => `made-up-${name.toLowerCase().replaceAll('_', '-')}${also}-${THIS_RUN}`

/** The login each name holds in the file now. A case that sets one again changes it here too. */
const theLoginOf = new Map<string, string>()
/** Every login this run wrote into the file, for the last search. */
const everyLoginWritten = new Set<string>()

type Outcome = 'works' | 'refused' | 'limit' | 'no-clear-answer' | 'no-test-known'
interface Tested {
  name: string
  outcome: Outcome
  status: number | null
  resetsAt: string | null
  balances: { total: string; currency: string }[]
  creditChecked: boolean | null
  readAt: string | null
  fromAnEarlierPress: boolean
}

// ---------------------------------------------------------------------------------------
// THE PROBES, as the decided design names them
// ---------------------------------------------------------------------------------------

type Provider = keyof typeof THE_ROUTED_PROVIDERS
interface AProbe {
  provider: Provider
  method: 'GET' | 'POST'
  path: string
  /** Which header carries the login. */
  carriedIn: 'authorization' | 'x-api-key'
  /** The JSON body the probe sends, or null for none. */
  body: unknown
  /** A good answer, and what is said of it. */
  works: string
  worksSays: Pick<Tested, 'creditChecked' | 'balances'>
}

const THE_GO_REQUEST = {
  model: 'deepseek-v4.1-flash',
  messages: [{ role: 'user', content: 'Reply with the single word READY.' }],
  max_tokens: 16,
}

type Probed = 'DEEPSEEK_API_KEY' | 'OPENCODE_API_KEY' | 'OPENROUTER_API_KEY' | 'OPENAI_API_KEY' | 'CODEX_API_KEY' | 'ANTHROPIC_API_KEY'

const PROBES: Record<Probed, AProbe> = {
  DEEPSEEK_API_KEY: {
    provider: 'deepseek',
    method: 'GET',
    path: '/user/balance',
    carriedIn: 'authorization',
    body: null,
    works: JSON.stringify({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '110.00', granted_balance: '0.00', topped_up_balance: '110.00' }] }),
    worksSays: { creditChecked: true, balances: [{ total: '110.00', currency: 'CNY' }] },
  },
  OPENCODE_API_KEY: {
    provider: 'opencode-go',
    method: 'POST',
    path: '/chat/completions',
    carriedIn: 'authorization',
    body: THE_GO_REQUEST,
    works: JSON.stringify({ id: 'made-up-completion', choices: [{ index: 0, message: { role: 'assistant', content: 'READY' } }] }),
    worksSays: { creditChecked: true, balances: [] },
  },
  OPENROUTER_API_KEY: {
    provider: 'openrouter',
    method: 'GET',
    path: '/key',
    carriedIn: 'authorization',
    body: null,
    works: JSON.stringify({ data: { label: 'made-up', limit: 20, usage: 7.5, limit_remaining: 12.5 } }),
    worksSays: { creditChecked: true, balances: [] },
  },
  OPENAI_API_KEY: {
    provider: 'openai',
    method: 'GET',
    path: '/models',
    carriedIn: 'authorization',
    body: null,
    works: JSON.stringify({ object: 'list', data: [{ id: 'a-made-up-model', object: 'model' }] }),
    worksSays: { creditChecked: false, balances: [] },
  },
  CODEX_API_KEY: {
    provider: 'openai',
    method: 'GET',
    path: '/models',
    carriedIn: 'authorization',
    body: null,
    works: JSON.stringify({ object: 'list', data: [{ id: 'a-made-up-model', object: 'model' }] }),
    worksSays: { creditChecked: false, balances: [] },
  },
  ANTHROPIC_API_KEY: {
    provider: 'anthropic',
    method: 'GET',
    path: '/models',
    carriedIn: 'x-api-key',
    body: null,
    works: JSON.stringify({ data: [{ id: 'a-made-up-model', type: 'model' }], has_more: false }),
    worksSays: { creditChecked: false, balances: [] },
  },
}

const PROBED = Object.keys(PROBES) as Probed[]

/**
 * THE DECLARED NAMES WITH NO PROBE, and why, as the decided design gives it: no documented free check for the
 * subscription token, an image-only key that may fail a model list while it works, and three names the office declares
 * no address for.
 */
const NO_TEST = ['CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_IMAGE_API_KEY', 'MINIMAX_API_KEY', 'MINIMAX_GROUP_ID', 'ELEVENLABS_API_KEY']

// ---------------------------------------------------------------------------------------
// THE MADE-UP PROVIDER AND THE STAND-IN FOR fetch
// ---------------------------------------------------------------------------------------

type Answer =
  | { status: number; headers?: Record<string, string>; body?: string; type?: string }
  /** Hold the request and never answer it. `reached` is called when the request has arrived. */
  | { hold: () => void }
  /** The stand-in for fetch fails with these words, as a send that never reached anybody does. */
  | { fails: string }

/** What each case queues, in order. The stand-in takes a failure; the made-up provider takes every other answer. */
const answers: Answer[] = []

interface Sent {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  /** Whether the code gave the request a signal to stop it by. */
  signal: boolean
}
/** Every request the code handed to fetch for a provider address in the table. */
const sent: Sent[] = []
/** Every request that reached the made-up provider: its path there. */
const received: string[] = []
/** Every address the code handed to fetch that is not a provider address in the table. Refused, never sent. */
const elsewhere: string[] = []
const held: ServerResponse[] = []

let provider: Server | undefined
let theMadeUpProvider = ''
const realFetch = globalThis.fetch

const THE_BASES = (Object.entries(THE_ROUTED_PROVIDERS) as [Provider, { upstream: string }][]).map(([key, one]) => [key, one.upstream] as const)

async function theStandInForFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const base = THE_BASES.find(([, upstream]) => url.startsWith(`${upstream}/`))
  if (base === undefined) {
    elsewhere.push(url)
    throw new TypeError('This test carries only the provider addresses in the router table.')
  }
  const headers = new Headers(init?.headers)
  const body = init?.body === undefined || init.body === null ? null : typeof init.body === 'string' ? init.body : '(a body that is not text)'
  sent.push({ url, method: (init?.method ?? 'GET').toUpperCase(), headers: Object.fromEntries(headers), body, signal: init?.signal != null })
  const next = answers[0]
  if (next !== undefined && 'fails' in next) {
    answers.shift()
    throw new TypeError(next.fails)
  }
  return realFetch(`${theMadeUpProvider}/${base[0]}${url.slice(base[1].length)}`, {
    method: init?.method,
    headers,
    ...(init?.body === undefined ? {} : { body: init.body }),
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
    ...(init?.redirect === undefined ? {} : { redirect: init.redirect }),
  })
}

// ---------------------------------------------------------------------------------------
// THE OFFICE
// ---------------------------------------------------------------------------------------

let t: TestDb
let app: FastifyInstance
let home = ''
let file = ''
const previousHome = process.env['HOME']
const logLines: string[] = []
const replies: string[] = []
const keys = new Map<string, string>()
let consoleSaid: () => string[] = () => []
let theClock = 0

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})
const asAgentWithItsKey = (handle: string): Record<string, string> => ({ ...asAgent(handle), 'x-mole-office-key': keys.get(handle) ?? '' })

/** The person's words, as a secretary would carry them for this door. */
const theirWords = {
  saidBy: THE_PERSON,
  words: 'Please test my sandbox logins.',
  where: 'terminal',
  when: '2026-09-26 10:00',
  for: ['office.test-sandbox-login'],
}

async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, body?: object): Promise<{ code: number; said: any; text: string; headers: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(body === undefined ? {} : { payload: body }) })
  replies.push(reply.body, JSON.stringify(reply.headers))
  let said: any = null
  try {
    said = reply.json()
  } catch {
    said = null
  }
  return { code: reply.statusCode, said, text: reply.body, headers: reply.headers }
}

const press = (name: string, headers: Record<string, string> = AS_THE_PERSON, also: object = {}) => ask('POST', THE_DOOR, headers, { name, ...also })

/** THE FILE THE TEMPLATES NAME, which must be inside this test's home before anything writes it. */
function theFileHere(): string {
  expect(file.startsWith(home + sep), `${file} is not inside this test's home ${home}`).toBe(true)
  return file
}

function writeTheFile(): void {
  writeFileSync(theFileHere(), [...theLoginOf].map(([name, value]) => `${name}=${value}\n`).join(''), { mode: 0o600 })
}

interface ARow {
  actor_type: string
  actor_id: string
  field: string | null
  old_value: string | null
  new_value: string | null
  at: string
}
function theActs(): ARow[] {
  return t.client.sqlite.prepare('SELECT actor_type, actor_id, field, old_value, new_value, at FROM changes WHERE record_id = ? ORDER BY rowid').all(THE_LEDGER_KEY) as ARow[]
}

const now = (): string => localStamp(new Date())
const aSecondsLater = (stamp: string, seconds: number): string => localStamp(new Date(new Date(stamp.replace(' ', 'T')).getTime() + seconds * 1000))

/** What a press is expected to answer, with readAt checked apart. */
function theAnswer(name: string, says: Partial<Tested> & Pick<Tested, 'outcome' | 'status'>): Tested {
  return { name, resetsAt: null, balances: [], creditChecked: null, readAt: expect.any(String) as unknown as string, fromAnEarlierPress: false, ...says }
}

/**
 * The whole 200 reply the door gives for an answer. The office adds this key with null to every object reply, to say
 * that permission took nothing off it, so an exact comparison expects it too.
 */
function theWholeReply(answer: Tested): Tested & Record<typeof NARROWED_BY_PERMISSION, null> {
  return { ...answer, [NARROWED_BY_PERMISSION]: null }
}

/** The one request a press sent: the table's address, its method, its body, and the login in its one header and nowhere else. */
function itSentTheTablesRequest(name: Probed, one: Sent | undefined): void {
  const probe = PROBES[name]
  const login = theLoginOf.get(name) ?? ''
  expect(one, `${name} sent nothing`).toBeDefined()
  if (one === undefined) return
  expect(one.url).toBe(`${THE_ROUTED_PROVIDERS[probe.provider].upstream}${probe.path}`)
  expect(one.method).toBe(probe.method)
  if (probe.body === null) expect(one.body).toBeNull()
  else {
    expect(JSON.parse(one.body ?? 'null')).toEqual(probe.body)
    expect(one.headers['content-type']).toBe('application/json')
  }
  if (probe.carriedIn === 'authorization') {
    expect(one.headers['authorization']).toBe(`Bearer ${login}`)
  } else {
    expect(one.headers['x-api-key']).toBe(login)
    expect(one.headers['anthropic-version']).toBe('2023-06-01')
  }
  expect(Object.entries(one.headers).filter(([, value]) => value.includes(login)).map(([header]) => header)).toEqual([probe.carriedIn])
  expect(one.url).not.toContain(login)
  expect(one.body ?? '').not.toContain(login)
  expect(one.signal, 'the request has no signal, so nothing stops it at 20 s').toBe(true)
}

/** The one act a tested press wrote: who, which name, when and the outcome, and never the login or a balance. */
function itWroteOneAct(name: string, actsBefore: number, said: Tested, from: string, to: string): void {
  const acts = theActs()
  expect(acts.length - actsBefore, `${name}: acts written`).toBe(1)
  const act = acts[acts.length - 1]!
  expect(act.actor_type).toBe('human')
  expect(act.actor_id).toBe(THE_PERSON)
  expect(act.field ?? '').toContain(name)
  expect(act.old_value).toBeNull()
  expect(JSON.parse(act.new_value ?? 'null')).toEqual({ outcome: said.outcome, status: said.status, resetsAt: said.resetsAt })
  expect(act.at >= from && act.at <= to, `${act.at} is not between ${from} and ${to}`).toBe(true)
  const written = JSON.stringify(act)
  for (const login of everyLoginWritten) expect(written).not.toContain(login)
  expect(written).not.toContain('balance')
  for (const one of said.balances) expect(written).not.toContain(one.total)
}

/** Press one probed name with one queued answer, and check the request, the reply's read time and the act. */
async function pressWith(name: Probed, answer: Answer, expected: Tested, reachesTheProvider = true): Promise<Tested> {
  const sentBefore = sent.length
  const receivedBefore = received.length
  const elsewhereBefore = elsewhere.length
  const actsBefore = theActs().length
  answers.push(answer)
  const from = now()
  const pressed = await press(name)
  const to = now()
  expect(pressed.code, pressed.text.slice(0, 400)).toBe(200)
  expect(pressed.said).toEqual(theWholeReply(expected))
  const said = pressed.said as Tested
  expect(said.readAt !== null && said.readAt >= from && said.readAt <= to, `readAt ${String(said.readAt)} is not between ${from} and ${to}`).toBe(true)
  expect(sent.length - sentBefore, `${name}: requests sent`).toBe(1)
  expect(elsewhere.slice(elsewhereBefore), `${name}: addresses outside the table`).toEqual([])
  itSentTheTablesRequest(name, sent[sentBefore])
  expect(received.length - receivedBefore, `${name}: requests that reached the made-up provider`).toBe(reachesTheProvider ? 1 : 0)
  expect(answers, 'the queued answer was not used').toEqual([])
  itWroteOneAct(name, actsBefore, said, from, to)
  return said
}

/** A press that must be refused or answered without sending anything, and without writing an act. */
async function itSendsNothing<T>(what: () => Promise<T>): Promise<T> {
  const sentBefore = sent.length
  const elsewhereBefore = elsewhere.length
  const actsBefore = theActs().length
  const out = await what()
  expect(sent.length - sentBefore, 'requests sent').toBe(0)
  expect(elsewhere.slice(elsewhereBefore), 'addresses outside the table').toEqual([])
  expect(theActs().length - actsBefore, 'acts written').toBe(0)
  return out
}

function everyFileIn(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) found.push(...everyFileIn(path))
    else found.push(path)
  }
  return found
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'mole-office-sandbox-login-tests-'))
  process.env['HOME'] = home
  const template = JSON.parse(readFileSync(join(REPO, 'sandboxes', 'mole-office-dev', 'sandbox.json'), 'utf8')) as { secrets: { hostFile: string } }
  file = template.secrets.hostFile.replace(/^~(?=\/)/, home)
  t = await freshDb()
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({ production: false, webDir: '/nonexistent', webAppUrl: 'http://localhost:5173', logLevel: 'info', logStream: { write: (line: string) => logLines.push(line) } })).app
  await app.ready()
  const asThePersonWithTheKey = { ...AS_THE_PERSON, ...thePersonsKeyHeader() }
  for (const [handle, role] of [['sec-one', 'secretary'], ['a-worker', 'worker']] as const) {
    const started = await ask('POST', '/api/agents/started', asThePersonWithTheKey, { handle, name: handle, role })
    expect(started.code, started.text.slice(0, 300)).toBe(201)
    keys.set(handle, String(started.said?.whatToGiveIt?.key ?? ''))
    expect(keys.get(handle), `no key was given to ${handle}`).not.toBe('')
  }
  const raised = await ask('POST', '/api/roles/elevation/sec-one', asThePersonWithTheKey, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(raised.code, raised.text.slice(0, 300)).toBe(201)

  // EVERY NAME THE TEMPLATES DECLARE, each set to a made-up login of its own.
  const read = await ask('GET', '/api/office/sandbox-logins', AS_THE_PERSON)
  expect(read.code, read.text.slice(0, 300)).toBe(200)
  for (const one of read.said.names as { name: string }[]) {
    theLoginOf.set(one.name, aMadeUpLogin(one.name))
    everyLoginWritten.add(aMadeUpLogin(one.name))
  }
  mkdirSync(dirname(theFileHere()), { recursive: true })
  writeTheFile()

  const madeUp = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      received.push(req.url ?? '')
      const answer = answers.shift()
      if (answer === undefined || 'fails' in answer) {
        res.writeHead(418, { 'content-type': 'text/plain' }).end('No answer was queued for this request.')
        return
      }
      if ('hold' in answer) {
        held.push(res)
        answer.hold()
        return
      }
      res.writeHead(answer.status, { 'content-type': answer.type ?? 'application/json', ...answer.headers }).end(answer.body ?? '')
    })
  })
  provider = madeUp
  await new Promise<void>((resolve) => madeUp.listen(0, '127.0.0.1', resolve))
  const port = (madeUp.address() as AddressInfo).port
  expect(port).not.toBe(28787)
  theMadeUpProvider = `http://127.0.0.1:${String(port)}`
  vi.stubGlobal('fetch', theStandInForFetch)

  const errors = vi.spyOn(console, 'error')
  const warnings = vi.spyOn(console, 'warn')
  consoleSaid = () => [...errors.mock.calls, ...warnings.mock.calls].map((args) => args.map((one) => (typeof one === 'string' ? one : inspect(one, { depth: 6 }))).join(' '))
  theClock = Date.now() + 10 * 60_000
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

// EACH CASE ON A CLOCK OF ITS OWN, a minute or more after the last one ended, so no case reads the 30 s result of another.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: theClock })
})

afterEach(() => {
  theClock = Date.now() + 60_000
  vi.useRealTimers()
  answers.length = 0
})

afterAll(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const res of held) res.destroy()
  const madeUp = provider
  if (madeUp !== undefined) {
    madeUp.closeAllConnections()
    await new Promise<void>((resolve) => madeUp.close(() => resolve()))
  }
  await app?.close()
  t?.close()
  if (previousHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = previousHome
  if (home !== '') rmSync(home, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------------------
// WHAT EVERY PROBE READS
// ---------------------------------------------------------------------------------------

interface ACase {
  what: string
  answer: (login: string, name: Probed) => Answer
  says: (name: Probed) => Partial<Tested> & Pick<Tested, 'outcome' | 'status'>
  /** resetsAt is the read time and this many seconds. */
  resetsAfter?: number
  reachesTheProvider?: boolean
}

const A_DATE = 'Wed, 25 Nov 2026 07:28:00 GMT'

const EVERY_PROBE_READS: ACase[] = [
  {
    // CATCHES: a good answer read as anything but works, or credit said to be checked where nothing was read for it.
    what: 'a good answer is works, with credit checked only where the answer is read for it',
    answer: (_login, name) => ({ status: 200, body: PROBES[name].works }),
    says: (name) => ({ outcome: 'works', status: 200, ...PROBES[name].worksSays }),
  },
  {
    // CATCHES: a probe that throws on a 200 it cannot parse, and answers a 500 whose sentence holds the provider's
    // words, or calls credit checked from a body it could not read.
    what: 'a 200 whose words are not JSON, and hold the login, is works and passes none of the words on',
    answer: (login) => ({ status: 200, type: 'text/plain', body: `all good for ${login}` }),
    says: (name) => ({ outcome: 'works', status: 200, creditChecked: name === 'OPENCODE_API_KEY', balances: [] }),
  },
  {
    // CATCHES: a bad login not shown as refused, and the provider's words and headers, which hold the login, passed on.
    what: 'a 401 is refused, and the words that hold the login are passed on nowhere',
    answer: (login) => ({
      status: 401,
      headers: { 'www-authenticate': `Bearer error="invalid_token", error_description="${login}"` },
      body: JSON.stringify({ error: { message: `Incorrect API key provided: ${login}`, type: 'invalid_request_error' } }),
    }),
    says: () => ({ outcome: 'refused', status: 401 }),
  },
  {
    // CATCHES: a 403 guessed into refused. None of the five providers documents a 403 as a bad key.
    what: 'a 403 is no clear answer, with its status',
    answer: (login) => ({ status: 403, body: JSON.stringify({ error: { message: `This region is not supported for ${login}` } }) }),
    says: () => ({ outcome: 'no-clear-answer', status: 403 }),
  },
  {
    // CATCHES: DeepSeek's insufficient balance not read as a limit, a reset time made up for it from a retry-after, or
    // another provider's 402 guessed into a limit.
    what: "a 402 is a limit with no reset time from DeepSeek, and no clear answer from every other provider",
    answer: (login) => ({ status: 402, headers: { 'retry-after': '120' }, body: JSON.stringify({ error: { message: `Insufficient Balance for ${login}` } }) }),
    says: (name) => (name === 'DEEPSEEK_API_KEY' ? { outcome: 'limit', status: 402, resetsAt: null } : { outcome: 'no-clear-answer', status: 402 }),
  },
  {
    // CATCHES: a 429 read as refused or no clear answer, or its reset time not taken from retry-after, or counted from
    // another moment than the one the answer was read at.
    what: 'a 429 with a retry-after of whole seconds is a limit that resets that many seconds after it was read',
    answer: () => ({ status: 429, headers: { 'retry-after': '120' }, body: JSON.stringify({ error: { message: 'Rate limit reached' } }) }),
    says: () => ({ outcome: 'limit', status: 429 }),
    resetsAfter: 120,
  },
  {
    // CATCHES: a reset time parsed out of an HTTP date, a form the decided design does not read.
    what: 'a 429 with a retry-after that is a date is a limit with no reset time',
    answer: () => ({ status: 429, headers: { 'retry-after': A_DATE } }),
    says: () => ({ outcome: 'limit', status: 429, resetsAt: null }),
  },
  {
    // CATCHES: a retry-after that is not whole seconds read anyway, as parseInt or Number would read "1.5".
    what: 'a 429 with a retry-after of 1.5 is a limit with no reset time',
    answer: () => ({ status: 429, headers: { 'retry-after': '1.5' } }),
    says: () => ({ outcome: 'limit', status: 429, resetsAt: null }),
  },
  {
    // CATCHES: a reset time guessed from the provider's words, or a five-hour window assumed when none is given.
    what: "a 429 with no retry-after is a limit with no reset time, whatever the provider's words say",
    answer: (login) => ({ status: 429, body: JSON.stringify({ error: { message: `usage limit reached (weekly, resets in 1d 14h) for ${login}` } }) }),
    says: () => ({ outcome: 'limit', status: 429, resetsAt: null }),
  },
  {
    // CATCHES: a status the table does not read guessed into works or refused, or the provider's words passed on.
    what: 'a 500 is no clear answer, with its status, and its words are passed on nowhere',
    answer: (login) => ({ status: 500, type: 'text/plain', body: `internal error while checking ${login}` }),
    says: () => ({ outcome: 'no-clear-answer', status: 500 }),
  },
  {
    // CATCHES: a redirect followed, which would send the login on to an address that is not the probe's own. Only
    // the Authorization header is dropped on a redirect to another host, so an x-api-key would go with it.
    what: 'a redirect is not followed, and is no clear answer with its status',
    answer: () => ({ status: 307, headers: { location: `${theMadeUpProvider}/somewhere-else` } }),
    says: () => ({ outcome: 'no-clear-answer', status: 307 }),
  },
  {
    // CATCHES: a send that failed thrown out of the door as a 500 whose sentence holds err.message, or read as refused.
    what: 'a send that fails is no clear answer with no status, and its words are passed on nowhere',
    answer: (login) => ({ fails: `fetch failed: connect ECONNREFUSED for ${login}` }),
    says: () => ({ outcome: 'no-clear-answer', status: null }),
    reachesTheProvider: false,
  },
]

describe.each(PROBED)('%s', (name) => {
  it.each(EVERY_PROBE_READS)('$what', async (one) => {
    const expected = theAnswer(name, one.says(name))
    if (one.resetsAfter === undefined) {
      await pressWith(name, one.answer(theLoginOf.get(name) ?? '', name), expected, one.reachesTheProvider ?? true)
      return
    }
    const said = await pressWith(name, one.answer(theLoginOf.get(name) ?? '', name), { ...expected, resetsAt: expect.any(String) as unknown as string }, one.reachesTheProvider ?? true)
    expect(said.resetsAt).toBe(aSecondsLater(said.readAt ?? '', one.resetsAfter))
  })

  it('no answer within 20 s is no clear answer with no status, and nothing waits longer', async () => {
    // CATCHES: a probe with no limit, or a longer one, that holds the press open while the provider says nothing; and
    // a timeout read as refused, or thrown out with its words.
    const at = Date.now()
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: at })
    const asked: number[] = []
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      asked.push(ms)
      const stopping = new AbortController()
      setTimeout(() => stopping.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), ms)
      return stopping.signal
    })
    // A TURN OF THE REAL EVENT LOOP, which the faked timers do not touch, so the request can travel to the made-up provider.
    const aTurn = async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(0)
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
    try {
      let reached = false
      const sentBefore = sent.length
      const actsBefore = theActs().length
      answers.push({ hold: () => { reached = true } })
      const from = now()
      let settled = false
      const pressing = press(name).finally(() => {
        settled = true
      })
      for (let turns = 0; !reached; turns++) {
        if (turns > 5_000) throw new Error('the request never reached the made-up provider')
        await aTurn()
      }
      expect(asked).toEqual([20_000])
      await vi.advanceTimersByTimeAsync(19_999)
      await aTurn()
      expect(settled, 'the press answered before 20 s').toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      for (let turns = 0; !settled; turns++) {
        if (turns > 5_000) throw new Error('the press did not answer once the 20 s had passed')
        await aTurn()
      }
      const pressed = await pressing
      const to = now()
      expect(pressed.code, pressed.text.slice(0, 400)).toBe(200)
      expect(pressed.said).toEqual(theWholeReply(theAnswer(name, { outcome: 'no-clear-answer', status: null })))
      expect(sent.length - sentBefore).toBe(1)
      itSentTheTablesRequest(name, sent[sentBefore])
      itWroteOneAct(name, actsBefore, pressed.said as Tested, from, to)
    } finally {
      timeout.mockRestore()
    }
  })
})

// ---------------------------------------------------------------------------------------
// WHAT ONE PROBE READS OF ITS OWN
// ---------------------------------------------------------------------------------------

describe('DeepSeek', () => {
  it('is_available false is a limit, and the balance is still shown', async () => {
    // CATCHES: a balance that has run out read as works, or the balance dropped from a limit read from the same answer.
    await pressWith(
      'DEEPSEEK_API_KEY',
      { status: 200, body: JSON.stringify({ is_available: false, balance_infos: [{ currency: 'CNY', total_balance: '0.00', granted_balance: '0.00', topped_up_balance: '0.00' }] }) },
      theAnswer('DEEPSEEK_API_KEY', { outcome: 'limit', status: 200, resetsAt: null, balances: [{ total: '0.00', currency: 'CNY' }] }),
    )
  })

  it('a 200 with no is_available is works with credit not checked, and the balance shown', async () => {
    // CATCHES: credit said to be checked when the field it is read from was not there.
    await pressWith(
      'DEEPSEEK_API_KEY',
      { status: 200, body: JSON.stringify({ balance_infos: [{ currency: 'USD', total_balance: '3.20' }] }) },
      theAnswer('DEEPSEEK_API_KEY', { outcome: 'works', status: 200, creditChecked: false, balances: [{ total: '3.20', currency: 'USD' }] }),
    )
  })

  it('shows only the balances whose currency is three capital letters and whose total is a plain decimal', async () => {
    // CATCHES: an entry shown whose currency or total fails the check, a total guessed out of words, and the login
    // itself shown as a balance when a provider answers with it.
    const login = theLoginOf.get('DEEPSEEK_API_KEY') ?? ''
    await pressWith(
      'DEEPSEEK_API_KEY',
      {
        status: 200,
        body: JSON.stringify({
          is_available: true,
          balance_infos: [
            { currency: 'CNY', total_balance: '4321.09' },
            { currency: 'cny', total_balance: '1.00' },
            { currency: 'USDT', total_balance: '2.00' },
            { currency: 'EUR', total_balance: '1e3' },
            { currency: 'GBP', total_balance: login },
            { currency: login, total_balance: '3.00' },
            { currency: 'JPY', total_balance: '110.00 CNY' },
            { currency: 'CHF', total_balance: '' },
            { currency: 'AUD' },
            { currency: 'USD', total_balance: '12.5' },
          ],
        }),
      },
      theAnswer('DEEPSEEK_API_KEY', {
        outcome: 'works',
        status: 200,
        creditChecked: true,
        balances: [
          { total: '4321.09', currency: 'CNY' },
          { total: '12.5', currency: 'USD' },
        ],
      }),
    )
  })
})

describe('OpenRouter', () => {
  it.each([
    // CATCHES: a key whose limit is used up read as works.
    { what: 'a limit_remaining of 0 is a limit', remaining: 0, says: { outcome: 'limit', status: 200, resetsAt: null } },
    // CATCHES: only exactly 0 read as used up, so a key past its limit reads as works.
    { what: 'a limit_remaining below 0 is a limit', remaining: -3, says: { outcome: 'limit', status: 200, resetsAt: null } },
    // CATCHES: `null <= 0`, which is true in JavaScript, so a key with no limit at all would read as a limit; or credit
    // said to be checked for it.
    { what: 'a limit_remaining of null, a key with no limit, is works with credit not checked', remaining: null, says: { outcome: 'works', status: 200, creditChecked: false } },
    // CATCHES: a missing field read as credit checked.
    { what: 'no limit_remaining is works with credit not checked', remaining: undefined, says: { outcome: 'works', status: 200, creditChecked: false } },
  ] as const)('$what', async (one) => {
    const data: Record<string, unknown> = { label: 'made-up', limit: 20, usage: 20 }
    if (one.remaining !== undefined) data['limit_remaining'] = one.remaining
    await pressWith('OPENROUTER_API_KEY', { status: 200, body: JSON.stringify({ data }) }, theAnswer('OPENROUTER_API_KEY', { ...one.says }))
  })
})

// ---------------------------------------------------------------------------------------
// THE NAMES WITH NO TEST
// ---------------------------------------------------------------------------------------

describe('the names with no test', () => {
  it('are exactly the names the templates declare that have no probe', async () => {
    // CATCHES: a name newly declared in a template that nobody decided a test for, or a probe for a name no template
    // declares any more.
    const read = await ask('GET', '/api/office/sandbox-logins', AS_THE_PERSON)
    const declared = (read.said.names as { name: string }[]).map((one) => one.name)
    expect(PROBED.filter((name) => !declared.includes(name))).toEqual([])
    expect(declared.filter((name) => !(PROBED as string[]).includes(name)).sort()).toEqual([...NO_TEST].sort())
  })

  it.each(NO_TEST)('%s answers no test known, and sends nothing', async (name) => {
    // CATCHES: a probe invented for a provider nobody can check, or a guessed address that the login would go to.
    const pressed = await itSendsNothing(() => press(name))
    expect(pressed.code, pressed.text.slice(0, 400)).toBe(200)
    expect(pressed.said).toEqual(theWholeReply({ name, outcome: 'no-test-known', status: null, resetsAt: null, balances: [], creditChecked: null, readAt: null, fromAnEarlierPress: false }))
  })
})

// ---------------------------------------------------------------------------------------
// WHO MAY PRESS IT, AND FOR WHICH NAME
// ---------------------------------------------------------------------------------------

describe('only the person, pressing it themselves, for a declared name that is set', () => {
  it.each([
    // CATCHES: an agent's own key taken as the person's, so any agent could send the person's logins out.
    { who: 'an agent with its own key', headers: () => asAgentWithItsKey('a-worker'), also: {} },
    // CATCHES: an agent's bare claim of a name taken for a press.
    { who: 'an agent with no key', headers: () => asAgent('a-worker'), also: {} },
    // CATCHES: the set and clear doors' guard reused, which lets a raised secretary press for the person.
    { who: 'the secretary the person raised, pressing it for the person', headers: () => asAgentWithItsKey('sec-one'), also: FOR_THE_PERSON },
    // CATCHES: the set and clear doors' guard reused, which lets a secretary in on the person's words.
    { who: "the secretary carrying the person's words for this door", headers: () => asAgentWithItsKey('sec-one'), also: { warrant: theirWords } },
  ])('refuses $who, sends nothing and writes nothing', async (one) => {
    const refused = await itSendsNothing(() => press('OPENROUTER_API_KEY', one.headers(), one.also))
    expect(refused.code, refused.text.slice(0, 400)).toBe(403)
    expect(refused.headers['cache-control']).toBe('no-store')
  })

  it('refuses a name no template declares, before anything is sent', async () => {
    // CATCHES: a name nobody declared read out of the file and sent somewhere.
    const refused = await itSendsNothing(() => press('SOME_OTHER_KEY'))
    expect(refused.code, refused.text.slice(0, 400)).toBe(400)
  })

  it('refuses a declared name the file does not set, before anything is sent', async () => {
    // CATCHES: an empty login sent to a provider, whose 401 would then say the person's login is bad.
    writeFileSync(theFileHere(), [...theLoginOf].filter(([name]) => name !== 'OPENAI_API_KEY').map(([name, value]) => `${name}=${value}\n`).join(''), { mode: 0o600 })
    try {
      const refused = await itSendsNothing(() => press('OPENAI_API_KEY'))
      expect(refused.code, refused.text.slice(0, 400)).toBe(409)
    } finally {
      writeTheFile()
    }
  })

  it('answers with the headers that keep a reply out of every cache', async () => {
    // CATCHES: a result about the person's login kept by a browser or a proxy, or sent on as a referrer.
    answers.push({ status: 200, body: PROBES.OPENAI_API_KEY.works })
    const pressed = await press('OPENAI_API_KEY')
    expect(pressed.code).toBe(200)
    expect(pressed.headers['cache-control']).toBe('no-store')
    expect(pressed.headers['pragma']).toBe('no-cache')
    expect(pressed.headers['referrer-policy']).toBe('no-referrer')
  })
})

// ---------------------------------------------------------------------------------------
// THE 30 S RESULT
// ---------------------------------------------------------------------------------------

describe('a second press', () => {
  it('inside 30 s answers the first result with its read time and sends nothing, and after 30 s tests again', async () => {
    // CATCHES: a press that calls the provider every time it is pressed, which can use up a limit by itself; a cached
    // result that does not say it is from before; and a result kept for longer than 30 s.
    const first = await pressWith('OPENROUTER_API_KEY', { status: 200, body: PROBES.OPENROUTER_API_KEY.works }, theAnswer('OPENROUTER_API_KEY', { outcome: 'works', status: 200, creditChecked: true }))
    vi.setSystemTime(Date.now() + 29_000)
    const again = await itSendsNothing(() => press('OPENROUTER_API_KEY'))
    expect(again.code).toBe(200)
    expect(again.said).toEqual({ ...first, fromAnEarlierPress: true })
    vi.setSystemTime(Date.now() + 2_000)
    const later = await pressWith(
      'OPENROUTER_API_KEY',
      { status: 401 },
      theAnswer('OPENROUTER_API_KEY', { outcome: 'refused', status: 401 }),
    )
    expect(later.readAt).not.toBe(first.readAt)
  })

  it('after the login is set again tests the new login, and not the result from before', async () => {
    // CATCHES: a result about the old login answered as if it were about the new one, inside the 30 s.
    await pressWith('OPENAI_API_KEY', { status: 200, body: PROBES.OPENAI_API_KEY.works }, theAnswer('OPENAI_API_KEY', { outcome: 'works', status: 200, creditChecked: false }))
    const another = aMadeUpLogin('OPENAI_API_KEY', '-set-again')
    everyLoginWritten.add(another)
    const set = await ask('POST', '/api/office/sandbox-logins/set', AS_THE_PERSON, { name: 'OPENAI_API_KEY', value: another })
    expect(set.code, set.text.slice(0, 300)).toBe(200)
    theLoginOf.set('OPENAI_API_KEY', another)
    await pressWith('OPENAI_API_KEY', { status: 401 }, theAnswer('OPENAI_API_KEY', { outcome: 'refused', status: 401 }))
  })

  it('after the login is cleared and written back by hand tests it again, and not the result from before', async () => {
    // CATCHES: the clear door leaving the old result, so a login put back by hand inside the 30 s is answered from it.
    await pressWith('CODEX_API_KEY', { status: 200, body: PROBES.CODEX_API_KEY.works }, theAnswer('CODEX_API_KEY', { outcome: 'works', status: 200, creditChecked: false }))
    const cleared = await ask('POST', '/api/office/sandbox-logins/clear', AS_THE_PERSON, { name: 'CODEX_API_KEY' })
    expect(cleared.code, cleared.text.slice(0, 300)).toBe(200)
    const notSet = await itSendsNothing(() => press('CODEX_API_KEY'))
    expect(notSet.code).toBe(409)
    appendFileSync(theFileHere(), `CODEX_API_KEY=${theLoginOf.get('CODEX_API_KEY') ?? ''}\n`)
    await pressWith('CODEX_API_KEY', { status: 429 }, theAnswer('CODEX_API_KEY', { outcome: 'limit', status: 429, resetsAt: null }))
  })
})

// ---------------------------------------------------------------------------------------
// THE LOGIN IS NOWHERE AFTERWARDS
// ---------------------------------------------------------------------------------------

describe('afterwards', () => {
  it('no login is in a reply, a log line, a change row, a record, an api_calls row, an office file, a console line or the environment', async () => {
    // CATCHES: a login, or provider words holding one, that reached anything the office keeps or shows. Many cases
    // above had the provider answer with the login in its words or its headers.
    await expect
      .poll(() => (t.client.sqlite.prepare("SELECT count(*) AS n FROM api_calls WHERE operation = 'office.test-sandbox-login'").get() as { n: number }).n)
      .toBeGreaterThanOrEqual(PROBED.length * EVERY_PROBE_READS.length)
    expect(logLines.some((line) => line.includes(THE_DOOR))).toBe(true)
    expect(theActs().length).toBeGreaterThanOrEqual(PROBED.length * (EVERY_PROBE_READS.length + 1))
    const everywhere: [string, string][] = [
      ...replies.map((one, i) => [`reply ${String(i)}`, one] as [string, string]),
      ...logLines.map((one, i) => [`log line ${String(i)}`, one] as [string, string]),
      ...consoleSaid().map((one, i) => [`console line ${String(i)}`, one] as [string, string]),
      ['the change rows', JSON.stringify(t.client.sqlite.prepare('SELECT * FROM changes').all())],
      ['the records', JSON.stringify(t.client.sqlite.prepare('SELECT * FROM records').all())],
      ['the api_calls rows', JSON.stringify(t.client.sqlite.prepare('SELECT * FROM api_calls').all())],
      ...Object.entries(process.env).map(([name, value]) => [`the environment's ${name}`, value ?? ''] as [string, string]),
    ]
    for (const login of everyLoginWritten) {
      for (const [where, text] of everywhere) expect(text.includes(login), `${where} holds a login`).toBe(false)
      for (const path of everyFileIn(dirname(t.file))) expect(readFileSync(path).includes(login), `${path} holds a login`).toBe(false)
    }
  })
})
