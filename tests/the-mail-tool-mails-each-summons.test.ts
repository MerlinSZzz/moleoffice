// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIL TOOL MAILS EACH SUMMONS FROM THE ACCOUNT LOGGED IN ON THIS COMPUTER. Three decisions and one more, of
 * 26 and 27 September 2026, moved the summons mail out of the office into a tool, gave the tool a key of its own to
 * read the summonses, and had it send through the account logged in on this computer, the office storing no password
 * and a list of addresses that may be empty.
 * Two more decisions, of 28 September 2026, have the person's Settings page ask the tool for its list, its account
 * and its test press, through its doors, with no page of its own.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED, of tools/mail-the-summonses.mjs
 * ---------------------------------------------------------------------------------------
 *
 *   1. It finds the account it can send from among those logged in (Mail on, a token for the mail server, TLS or
 *      STARTTLS), says why each other cannot, and takes a stand-in mail server only as smtp:// on this computer.
 *   2. It mails each summons made through the office's own door, oldest first, one letter to each address on its list,
 *      in the one letter of src/config/the-summons-mail.mjs, logged in with the account's token; and moves its place.
 *   3. A letter the server did not take now is sent again on the next round, and only to the addresses still waiting;
 *      the place does not move until then.
 *   4. A letter refused for good is not tried again, and the other addresses still get theirs.
 *   5. A login the server refuses leaves the summons for the next round.
 *   6. A summons the office cannot read is mailed as exactly that, naming it, and the tool reads on after it.
 *   7. A key the office does not take stops the reading until a new key is in its folder.
 *   8. On its first start it mails nothing made before it; an empty list mails nothing and passes the summonses over.
 *   9. Its doors answer only as 127.0.0.1, only with its secret, and only a page of the office's own origin: a wrong
 *      list is refused whole with a code, a right one saved, the test press mails the test letter, and it answers what
 *      became of each letter; it keeps no page.
 *  10. Over STARTTLS and over TLS the letter and the login go encrypted; a server that offers no STARTTLS, or whose
 *      certificate is not trusted, is sent no token.
 *  11. Its log names no address, account or server, and never a key or a token.
 *  12. Turned back on after the person's press turned it off, whose place then says to start after the newest summons, it mails
 *      nothing made while it was off, says so, and mails what comes after.
 *  13. At its start it says which of the office's pages may read its doors, by port and never by address, and says so
 *      where it happens when the office's web app address cannot be read (problem cmlTxSP_m1rR).
 *  (2, too) Each letter's Message-ID ends in the sending account's own domain (problem SvYupfTs3E4r).
 *
 * NOTHING HERE TOUCHES THE PERSON'S ACCOUNT: GNOME Online Accounts is a stand-in busctl, the mail server is a stand-in on this
 * computer, and the office is a fresh one on a port of its own. The certificate for case 10 is made by openssl when the
 * test starts, into its own temporary folder.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the place moved past a summons before its letters are sent: case 3 goes red on the place;
 *   - the addresses already mailed for a summons forgotten between rounds: case 3 goes red on the second letter;
 *   - a 5xx answer taken as "try again": case 4 goes red on the place;
 *   - the unreadable summons read as an office that did not answer: case 6 goes red;
 *   - the first start reading from the first summons instead of after the newest: case 8 goes red;
 *   - any smtp:// server taken as a stand-in: case 1 goes red;
 *   - STARTTLS skipped, the login sent over the plain connection: case 10 goes red;
 *   - the doors' secret not asked for: case 9 goes red;
 *   - a page of any origin let read the answers: case 9 goes red (the run that moved the page into Settings);
 *   - the token put in the log line of a send: case 11 goes red;
 *   - and, with the press that turns it off (the report of the run that added case 12): the place that press leaves
 *     read as the id of a summons, and case 12 goes red;
 *   - and, with problem SvYupfTs3E4r: the Message-ID ending in "mole-office" again, and case 2 goes red;
 *   - and, with problem cmlTxSP_m1rR: the web app's address that could not be read passed over in silence, or the
 *     pages that may read left unsaid, and case 13 goes red.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TLSSocket, createServer as createTlsServer } from 'node:tls'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theSummonsMail, theTestMail, theUnreadableSummonsMail } from '../src/config/the-summons-mail.mjs'
import { THE_PLACE_AFTER_THE_NEWEST } from '../src/config/the-mail-tool.mjs'
import { settingNamed } from '../src/config/settings.mjs'
import {
  makeTheFolder,
  makeTheTool,
  saveTheAddresses,
  sendLetters,
  serveTheDoors,
  theOfficesOrigins,
  theOriginsAtStart,
  theAccounts,
  theSender,
  whereToSend,
  writeIntoTheFolder,
} from '../tools/mail-the-summonses.mjs'

const THE_TOKEN = 'ya29.a-stand-in-token-nobody-issued'
const SENDER = 'bell@example.test'
const A = 'first@example.test'
const B = 'second@example.test'
/** The office's API port: the product's default, as src/config/settings.mjs declares it. */
const THE_API_PORT = String(settingNamed('MOLE_OFFICE_PORT').fallback)

let t: TestDb
let app: FastifyInstance
let officeAt = ''
let scratch = ''
let busctl = ''
let goaSetup = ''
let tlsFiles = { key: '', cert: '' }
let mailKey = ''
let secretaryKey = ''
const log: string[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** A secretary proved by its own key, as a secretary calls the person in the office. */
const asTheSecretary = () => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-key': secretaryKey,
})

// ============================================================================ the stand-ins

/** One property as busctl prints it. */
const v = (type: string, data: unknown) => ({ type, data })

/** The accounts the stand-in GNOME Online Accounts holds: one that can send, and three that cannot or are not mail. */
function theAccountsLoggedIn(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    '/org/gnome/OnlineAccounts/Accounts/account_1': {
      'org.gnome.OnlineAccounts.Account': {
        Id: v('s', 'account_1'),
        ProviderName: v('s', 'Google'),
        PresentationIdentity: v('s', SENDER),
        MailDisabled: v('b', false),
        AttentionNeeded: v('b', false),
      },
      'org.gnome.OnlineAccounts.OAuth2Based': { ClientId: v('s', 'a-client') },
      'org.gnome.OnlineAccounts.Mail': {
        EmailAddress: v('s', SENDER),
        SmtpSupported: v('b', true),
        SmtpHost: v('s', 'smtp.example.test'),
        SmtpUserName: v('s', SENDER),
        SmtpUseSsl: v('b', false),
        SmtpUseTls: v('b', true),
        SmtpAuthXoauth2: v('b', true),
      },
    },
    '/org/gnome/OnlineAccounts/Accounts/account_2': {
      'org.gnome.OnlineAccounts.Account': { Id: v('s', 'account_2'), ProviderName: v('s', 'IMAP and SMTP'), MailDisabled: v('b', false) },
      'org.gnome.OnlineAccounts.PasswordBased': {},
      'org.gnome.OnlineAccounts.Mail': {
        EmailAddress: v('s', 'old@example.test'),
        SmtpSupported: v('b', true),
        SmtpHost: v('s', 'mail.example.test:465'),
        SmtpUseSsl: v('b', true),
        SmtpAuthXoauth2: v('b', false),
      },
    },
    '/org/gnome/OnlineAccounts/Accounts/account_3': {
      'org.gnome.OnlineAccounts.Account': { Id: v('s', 'account_3'), ProviderName: v('s', 'Google'), MailDisabled: v('b', true) },
      'org.gnome.OnlineAccounts.OAuth2Based': {},
    },
    '/org/gnome/OnlineAccounts/Accounts/account_4': {
      'org.gnome.OnlineAccounts.Account': { Id: v('s', 'account_4'), ProviderName: v('s', 'Nextcloud'), MailDisabled: v('b', false) },
    },
    ...extra,
  }
}

/** What the stand-in busctl answers: the accounts, and the token GetAccessToken gives. */
function goa(setup: { objects?: Record<string, unknown>; token?: string }): void {
  writeFileSync(goaSetup, JSON.stringify({ objects: setup.objects ?? theAccountsLoggedIn(), token: setup.token ?? THE_TOKEN }))
}

/** Every call the stand-in busctl was asked, as its arguments. */
function goaCalls(): string[][] {
  try {
    return readFileSync(`${goaSetup}.calls`, 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as string[])
  } catch {
    return []
  }
}

interface ALetter {
  from: string
  to: string[]
  data: string
  overTls: boolean
}

/**
 * A STAND-IN MAIL SERVER ON THIS COMPUTER, plain, offering STARTTLS, or TLS from the first byte. It takes the login only
 * as XOAUTH2 with the account's address and the stand-in token, and keeps each letter it took.
 */
class StandInMailServer {
  letters: ALetter[] = []
  logins: { said: string; overTls: boolean }[] = []
  /** What RCPT TO answers for an address, when not 250. */
  refusals = new Map<string, string>()
  /** What the end of DATA answers, in turn; 250 once these are used. */
  dataAnswers: string[] = []
  port = 0
  private server: Server | null = null

  constructor(private readonly mode: 'plain' | 'starttls' | 'tls' | 'plain, no starttls') {}

  async start(): Promise<this> {
    const tls = { key: readFileSync(tlsFiles.key), cert: readFileSync(tlsFiles.cert) }
    this.server =
      this.mode === 'tls'
        ? createTlsServer(tls, (socket) => this.converse(socket, true, true))
        : createServer((socket) => this.converse(socket, false, true))
    await new Promise<void>((done) => this.server?.listen(0, '127.0.0.1', () => done()))
    this.port = (this.server.address() as AddressInfo).port
    return this
  }

  async close(): Promise<void> {
    await new Promise<void>((done) => (this.server === null ? done() : this.server.close(() => done())))
  }

  private converse(socket: Socket, overTls: boolean, greet: boolean): void {
    let buffer = ''
    let inData = false
    let refuseTheNextLine = false
    let envelope = { from: '', to: [] as string[] }
    const say = (line: string) => socket.write(`${line}\r\n`)
    socket.on('error', () => undefined)
    if (greet) say('220 stand-in ESMTP')
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8')
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n')
          if (end < 0) return
          const data = buffer.slice(0, end + 2)
          buffer = buffer.slice(end + 5)
          inData = false
          const answer = this.dataAnswers.shift() ?? '250 2.0.0 OK'
          if (answer.startsWith('250')) this.letters.push({ from: envelope.from, to: [...envelope.to], data, overTls })
          envelope = { from: '', to: [] }
          say(answer)
          continue
        }
        const at = buffer.indexOf('\r\n')
        if (at < 0) return
        const line = buffer.slice(0, at)
        buffer = buffer.slice(at + 2)
        if (refuseTheNextLine) {
          refuseTheNextLine = false
          say('535 5.7.8 Username and Password not accepted')
          continue
        }
        const verb = (line.split(' ')[0] ?? '').toUpperCase()
        if (verb === 'EHLO') {
          const offers = this.mode === 'starttls' && !overTls ? ['STARTTLS'] : []
          for (const one of ['stand-in', ...offers]) say(`250-${one}`)
          say('250 AUTH XOAUTH2')
        } else if (verb === 'STARTTLS' && this.mode === 'starttls' && !overTls) {
          say('220 2.0.0 Ready to start TLS')
          socket.off('data', onData)
          const secure = new TLSSocket(socket, { isServer: true, key: readFileSync(tlsFiles.key), cert: readFileSync(tlsFiles.cert) })
          this.converse(secure, true, false)
          return
        } else if (verb === 'AUTH') {
          const said = Buffer.from(line.split(' ')[2] ?? '', 'base64').toString('utf8')
          this.logins.push({ said, overTls })
          if (said === `user=${SENDER}\u0001auth=Bearer ${THE_TOKEN}\u0001\u0001`) say('235 2.7.0 Accepted')
          else {
            say(`334 ${Buffer.from('{"status":"401"}').toString('base64')}`)
            refuseTheNextLine = true
          }
        } else if (verb === 'MAIL') {
          envelope.from = /<(.*)>/.exec(line)?.[1] ?? ''
          say('250 2.1.0 OK')
        } else if (verb === 'RCPT') {
          const to = /<(.*)>/.exec(line)?.[1] ?? ''
          const refusal = this.refusals.get(to)
          if (refusal !== undefined) say(refusal)
          else {
            envelope.to.push(to)
            say('250 2.1.5 OK')
          }
        } else if (verb === 'DATA') {
          inData = true
          say('354 Go ahead')
        } else if (verb === 'RSET') {
          envelope = { from: '', to: [] }
          say('250 2.0.0 OK')
        } else if (verb === 'QUIT') {
          say('221 2.0.0 Bye')
          socket.end()
          return
        } else say('502 5.5.1 Unrecognized command')
      }
    }
    socket.on('data', onData)
  }
}

// ============================================================================ reading a letter

/** A letter's header, decoded where it was encoded. */
function header(data: string, name: string): string {
  const unfolded = data.split('\r\n\r\n')[0]?.replace(/\r\n /g, ' ') ?? ''
  const line = unfolded.split('\r\n').find((one) => one.startsWith(`${name}: `))
  const value = line?.slice(name.length + 2) ?? ''
  return value.replace(/=\?UTF-8\?B\?([^?]*)\?=\s?/g, (_all, b64: string) => Buffer.from(b64, 'base64').toString('utf8'))
}

/** A letter's body, decoded. */
function bodyOf(data: string): string {
  const body = data.split('\r\n\r\n').slice(1).join('\r\n\r\n')
  return Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8')
}

// ============================================================================ the office and the tool

async function summon(title: string, urgency: 'now' | 'soon' = 'now'): Promise<string> {
  const called = await app.inject({ method: 'POST', url: '/api/office/summon', headers: asTheSecretary(), payload: { title, urgency } })
  expect(called.statusCode, called.body.slice(0, 300)).toBe(200)
  return String((called.json() as { message: string }).message)
}

let folders = 0

/** A tool with a folder of its own: the key, and the list, and a stand-in mail server to send through. */
function aTool(input: { server: StandInMailServer; addresses?: string[]; key?: string }) {
  folders += 1
  const dir = join(scratch, `tool-${String(folders)}`)
  makeTheFolder(dir)
  writeIntoTheFolder(dir, 'key', `${input.key ?? mailKey}\n`)
  if (input.addresses !== undefined) saveTheAddresses(dir, input.addresses.join('\n'))
  const tool = makeTheTool({ dir, api: officeAt, busctl, smtpServer: `smtp://127.0.0.1:${String(input.server.port)}`, say: (line) => log.push(line) })
  return { tool, dir, place: () => readFileSync(join(dir, 'place'), 'utf8').trim() }
}

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mail-tool-test-'))
  tlsFiles = { key: join(scratch, 'key.pem'), cert: join(scratch, 'cert.pem') }
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', tlsFiles.key, '-out', tlsFiles.cert,
      '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'],
    { stdio: 'ignore' },
  )
  // THE STAND-IN busctl: it answers GetManagedObjects and GetAccessToken as busctl --json=short prints them, from a file
  // the test writes, and notes every call.
  goaSetup = join(scratch, 'goa.json')
  goa({})
  busctl = join(scratch, 'busctl')
  writeFileSync(
    busctl,
    `#!/usr/bin/env node
const fs = require('node:fs')
const setup = JSON.parse(fs.readFileSync(${JSON.stringify(goaSetup)}, 'utf8'))
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(`${goaSetup}.calls`)}, JSON.stringify(args) + '\\n')
const method = args[6]
if (args[0] !== '--user' || args[1] !== '--json=short' || args[2] !== 'call' || args[3] !== 'org.gnome.OnlineAccounts') {
  process.stderr.write('Call failed: not what the tool asks\\n'); process.exit(1)
}
if (method === 'GetManagedObjects') { process.stdout.write(JSON.stringify({ type: 'a{oa{sa{sv}}}', data: [setup.objects] }) + '\\n'); process.exit(0) }
if (method === 'GetAccessToken' && args[5] === 'org.gnome.OnlineAccounts.OAuth2Based') {
  process.stdout.write(JSON.stringify({ type: 'si', data: [setup.token, 3599] }) + '\\n'); process.exit(0)
}
process.stderr.write('Call failed: Unknown method ' + method + '\\n'); process.exit(1)
`,
  )
  chmodSync(busctl, 0o755)

  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  officeAt = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  for (const [handle, name, role] of [
    ['sec-one', 'Secretary One', 'secretary'],
  ] as const) {
    const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name, role } })
    expect(started.statusCode, started.body.slice(0, 300)).toBe(201)
    const key = String((started.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
    secretaryKey = key
  }
  const { holdTheKeyWhoseHashIs, keyHash } = await import('../src/server/lib/keys.ts')
  mailKey = 'b'.repeat(64)
  holdTheKeyWhoseHashIs('person-tool', 'mail-tool', keyHash(mailKey), 'the-persons-press')
  expect(mailKey, 'the person\'s tool key').toMatch(/^[0-9a-f]{64}$/)
  expect(secretaryKey, 'the registration answered the secretary no key').toMatch(/^[0-9a-f]{64}$/)
  // AND THE KEY WINDOW CLOSED, as the person's press closed it in the office on 27 September 2026: while it is open, a request
  // from this computer's own program with no key it holds is read as the person, and a key taken back would still read.
  t.client.sqlite
    .prepare("UPDATE installation SET window_closed_at = '2026-09-27 11:11:39', window_closed_by_kind = 'person', window_closed_by_id = ? WHERE only_row = 1")
    .run(THE_PERSON)
  ;(await import('../src/server/lib/keywindow.ts')).forgetTheKeyWindowThisProcessRead()
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe('the mail tool', () => {
  it('1: finds the account it can send from, says why the others cannot, and takes a stand-in only on this computer', async () => {
    goa({})
    const accounts = await theAccounts(busctl)
    expect(accounts.usable.map((one) => one.id)).toEqual(['account_1'])
    expect(accounts.usable[0]).toMatchObject({ address: SENDER, user: SENDER, host: 'smtp.example.test', port: null, security: 'starttls', provider: 'Google' })
    // THE PASSWORD ACCOUNT IS NAMED WITH WHY, AS A CODE; THE ONE WITH MAIL OFF AND THE ONE WITH NO MAIL AT ALL ARE NOT LISTED.
    expect(accounts.unusable).toEqual([{ name: 'old@example.test', provider: 'IMAP and SMTP', reason: 'asks a password' }])
    const one = accounts.usable[0]
    if (one === undefined) throw new Error('no account')
    expect(whereToSend(one, undefined)).toMatchObject({ host: 'smtp.example.test', port: 587, security: 'starttls' })
    expect(whereToSend({ ...one, security: 'tls' }, undefined)).toMatchObject({ port: 465, security: 'tls' })
    expect(whereToSend({ ...one, port: 2465 }, undefined)).toMatchObject({ port: 2465 })
    // A STAND-IN: smtp:// on this computer, and nothing else.
    expect(whereToSend(one, 'smtp://127.0.0.1:2525')).toMatchObject({ host: '127.0.0.1', port: 2525, security: 'plain' })
    expect(whereToSend(one, 'smtp://[::1]:2525')).toMatchObject({ host: '::1', security: 'plain' })
    expect(() => whereToSend(one, 'smtp://mail.example.test:25')).toThrow(/stand-in on this computer/)
    expect(() => whereToSend(one, 'smtps://127.0.0.1:465')).toThrow(/stand-in on this computer/)
    // WHICH ONE SENDS: the only one; with none, why; with several, the one the person picked, and none until they pick.
    expect(theSender(accounts, null)).toMatchObject({ account: { id: 'account_1' } })
    expect(theSender({ usable: [], unusable: [] }, null)).toMatchObject({ account: null, reason: 'no account', short: 'no account on this computer can send' })
    const two = { usable: [one, { ...one, id: 'account_9', address: 'other@example.test' }], unusable: [] }
    expect(theSender(two, null)).toMatchObject({ account: null, reason: 'pick one', count: 2, short: 'several accounts can send and none is picked' })
    expect(theSender(two, 'account_9')).toMatchObject({ account: { id: 'account_9' } })
  })

  it('2: mails each summons made through the door, oldest first, one letter to each address, and moves its place', async () => {
    goa({})
    const server = await new StandInMailServer('plain').start()
    try {
      const { tool, place } = aTool({ server, addresses: [A, B] })
      await tool.round()
      const first = await summon('The nightly build is red', 'now')
      const second = await summon('A review waits for you', 'soon')
      const tokensBefore = goaCalls().filter((call) => call[6] === 'GetAccessToken').length
      await tool.round()
      expect(server.letters.map((one) => one.to)).toEqual([[A], [B], [A], [B]])
      const expected = [
        theSummonsMail({ who: 'Secretary One', title: 'The nightly build is red', urgency: 'now' }),
        theSummonsMail({ who: 'Secretary One', title: 'A review waits for you', urgency: 'soon' }),
      ]
      for (const [at, letter] of server.letters.entries()) {
        const mail = expected[Math.floor(at / 2)]
        expect(header(letter.data, 'Subject')).toBe(mail?.subject)
        expect(bodyOf(letter.data)).toBe(mail?.body)
        expect(header(letter.data, 'From')).toBe(`Mole Office <${SENDER}>`)
        // ONE LETTER TO EACH ADDRESS: nobody on the list sees another's address.
        expect(header(letter.data, 'To')).toBe(`<${letter.to[0] ?? ''}>`)
        expect(letter.from).toBe(SENDER)
        // THE DATE IN THIS COMPUTER'S TIME WITH ITS OFFSET, never GMT (chapter 4 rule 8).
        expect(header(letter.data, 'Date')).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}$/)
        // THE MESSAGE-ID IN THE SENDING ACCOUNT'S OWN DOMAIN, not a name that is no domain (problem SvYupfTs3E4r).
        expect(header(letter.data, 'Message-ID')).toMatch(/^<[0-9a-f]{24}@example\.test>$/)
      }
      // A LOGIN AND A TOKEN FOR EACH SUMMONS MAILED, the token asked for at each send and none kept.
      expect(server.logins.map((one) => one.said)).toEqual([1, 2].map(() => `user=${SENDER}\u0001auth=Bearer ${THE_TOKEN}\u0001\u0001`))
      expect(goaCalls().filter((call) => call[6] === 'GetAccessToken').length - tokensBefore).toBe(2)
      expect([first, second]).toContain(place())
      expect(place()).toBe(second)
      await tool.round()
      expect(server.letters).toHaveLength(4)
    } finally {
      await server.close()
    }
  })

  it('3: sends a letter the server did not take now on the next round, only to the addresses still waiting', async () => {
    goa({})
    const server = await new StandInMailServer('plain').start()
    try {
      const { tool, place } = aTool({ server, addresses: [A, B] })
      await tool.round()
      const before = place()
      server.dataAnswers.push('250 2.0.0 OK', '451 4.3.0 Try again later')
      const id = await summon('The disk is nearly full')
      await tool.round()
      expect(server.letters.map((one) => one.to)).toEqual([[A]])
      expect(place(), 'the place moved past a summons one address was still waiting for').toBe(before)
      await tool.round()
      expect(server.letters.map((one) => one.to), 'the address that had it was mailed again').toEqual([[A], [B]])
      expect(place()).toBe(id)
    } finally {
      await server.close()
    }
  })

  it('4: does not try again a letter refused for good, and the other addresses still get theirs', async () => {
    goa({})
    const server = await new StandInMailServer('plain').start()
    try {
      const { tool, place } = aTool({ server, addresses: [A, B] })
      await tool.round()
      server.refusals.set(B, `550 5.1.1 <${B}> No such user`)
      const id = await summon('The robot stopped')
      await tool.round()
      expect(server.letters.map((one) => one.to)).toEqual([[A]])
      expect(place()).toBe(id)
      await tool.round()
      expect(server.letters).toHaveLength(1)
      expect(log.some((line) => line.includes('refused 1 for good'))).toBe(true)
    } finally {
      await server.close()
    }
  })

  it("5: leaves the summons for the next round when the account's server refuses the login", async () => {
    goa({ token: 'a-token-the-server-does-not-take' })
    const server = await new StandInMailServer('plain').start()
    try {
      const { tool, place } = aTool({ server, addresses: [A] })
      await tool.round()
      const before = place()
      const id = await summon('A login is refused')
      await tool.round()
      expect(server.letters).toHaveLength(0)
      expect(place()).toBe(before)
      expect(log.some((line) => line.includes('refused the login (535)'))).toBe(true)
      goa({})
      await tool.round()
      expect(server.letters.map((one) => header(one.data, 'Subject'))).toEqual([theSummonsMail({ who: 'Secretary One', title: 'A login is refused', urgency: 'now' }).subject])
      expect(place()).toBe(id)
    } finally {
      await server.close()
    }
  })

  it('6: mails a summons the office cannot read as exactly that, naming it, and reads on after it', async () => {
    goa({})
    const server = await new StandInMailServer('plain').start()
    try {
      const { tool, place } = aTool({ server, addresses: [A] })
      await tool.round()
      const broken = await summon('Lacking its urgency')
      t.client.sqlite.prepare('UPDATE records SET data = json_remove(data, ?) WHERE id = ?').run('$.summons.urgency', broken)
      const after = await summon('Made after the broken one', 'soon')
      await tool.round()
      const unreadable = theUnreadableSummonsMail(broken)
      expect(server.letters.map((one) => header(one.data, 'Subject'))).toEqual([
        unreadable.subject,
        theSummonsMail({ who: 'Secretary One', title: 'Made after the broken one', urgency: 'soon' }).subject,
      ])
      expect(bodyOf(server.letters[0]?.data ?? '')).toBe(unreadable.body)
      expect(bodyOf(server.letters[0]?.data ?? '')).toContain(broken)
      expect(place()).toBe(after)
    } finally {
      await server.close()
    }
  })

  it('7: stops reading on a key the office does not take, until a new key is in its folder', async () => {
    goa({})
    const server = await new StandInMailServer('plain').start()
    try {
      const { tool, dir } = aTool({ server, addresses: [A] })
      await tool.round()
      writeIntoTheFolder(dir, 'key', `${'0'.repeat(64)}\n`)
      const id = await summon('Made while the key is wrong')
      await tool.round()
      expect(tool.state.key).toBe('refused')
      expect(server.letters).toHaveLength(0)
      await tool.round()
      expect(tool.state.key).toBe('refused')
      writeIntoTheFolder(dir, 'key', `${mailKey}\n`)
      await tool.round()
      expect(tool.state.key).toBe('works')
      expect(server.letters.map((one) => bodyOf(one.data))).toEqual([theSummonsMail({ who: 'Secretary One', title: 'Made while the key is wrong', urgency: 'now' }).body])
      expect(readFileSync(join(dir, 'place'), 'utf8').trim()).toBe(id)
    } finally {
      await server.close()
    }
  })

  it('8: mails nothing made before its first start, and passes the summonses over while the list is empty', async () => {
    goa({})
    const server = await new StandInMailServer('plain').start()
    try {
      const older = await summon('Made before the tool began')
      const { tool, place, dir } = aTool({ server, addresses: [A] })
      await tool.round()
      expect(server.letters).toHaveLength(0)
      expect(place()).toBe(older)
      expect(log.some((line) => /Started after the newest summons: the \d+ made before this tool began are not mailed\./.test(line))).toBe(true)
      saveTheAddresses(dir, '')
      const passed = await summon('Made while the list is empty')
      await tool.round()
      expect(server.letters).toHaveLength(0)
      expect(place()).toBe(passed)
      saveTheAddresses(dir, A)
      await tool.round()
      expect(server.letters, 'a summons passed over while the list was empty was mailed later').toHaveLength(0)
    } finally {
      await server.close()
    }
  })

  it("9: answers only as 127.0.0.1, with its secret, and to the office's own page; refuses a wrong list whole, and the test press mails", async () => {
    goa({})
    const server = await new StandInMailServer('plain').start()
    const secret = 'a-doors-secret-for-this-test-only'
    const office = `http://127.0.0.1:${THE_API_PORT}`
    const { tool, dir } = aTool({ server, addresses: [A] })
    const doors = await serveTheDoors(tool, { secret, origins: theOfficesOrigins([office]) })
    const at = `http://127.0.0.1:${String(doors.port)}`
    const ask = (path: string, init: { method?: string; body?: unknown; secret?: string | null; origin?: string } = {}) =>
      fetch(`${at}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          ...(init.secret === null ? {} : { 'x-mail-tool-secret': init.secret ?? secret }),
          ...(init.origin === undefined ? {} : { origin: init.origin }),
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      })
    try {
      // THE OFFICE'S OWN ORIGINS, as 127.0.0.1 and as localhost; nothing else, and nothing from what is not an address.
      expect(theOfficesOrigins([office, 'http://localhost:5173', undefined, '', 'not an address'])).toEqual([
        office, `http://localhost:${THE_API_PORT}`, 'http://localhost:5173', 'http://127.0.0.1:5173',
      ])
      // WITHOUT THE SECRET, OR WITH ANOTHER, NOTHING IS SHOWN AND NOTHING IS CHANGED.
      for (const given of [null, 'not-the-secret']) {
        const refused = await ask('/state', { secret: given })
        expect(refused.status).toBe(403)
        const said = await refused.text()
        expect(said).toContain('"refused":"secret"')
        expect(said).not.toContain(A)
      }
      const unsigned = await ask('/addresses', { method: 'POST', body: { addresses: B }, secret: null })
      expect(unsigned.status).toBe(403)
      expect(JSON.parse(readFileSync(join(dir, 'addresses.json'), 'utf8'))).toEqual({ addresses: [A] })
      // AS ANOTHER HOST NAME, as a page that rebinds a name of its own to this computer would ask: refused.
      const rebound = await new Promise<number>((done, failed) => {
        const asked = request({ host: '127.0.0.1', port: doors.port, path: '/state', headers: { host: `somewhere.example:${String(doors.port)}`, 'x-mail-tool-secret': secret } }, (res) => {
          res.resume()
          done(res.statusCode ?? 0)
        })
        asked.on('error', failed)
        asked.end()
      })
      expect(rebound).toBe(403)
      // A PAGE OF ANOTHER ORIGIN, EVEN WITH THE SECRET: refused, and its answer may not be read by that page.
      const foreign = await ask('/state', { origin: 'http://somewhere.example' })
      expect(foreign.status).toBe(403)
      expect(foreign.headers.get('access-control-allow-origin')).toBeNull()
      expect(await foreign.text()).not.toContain(A)
      const foreignPreflight = await fetch(`${at}/addresses`, { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:1', 'access-control-request-method': 'POST' } })
      expect(foreignPreflight.status).toBe(403)
      // THE OFFICE'S OWN PAGE: its preflight is answered, and its reads carry the header that lets it read them.
      const preflight = await fetch(`${at}/addresses`, {
        method: 'OPTIONS',
        headers: { origin: office, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type, x-mail-tool-secret' },
      })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-origin')).toBe(office)
      expect(preflight.headers.get('access-control-allow-headers')).toContain('x-mail-tool-secret')
      const shown = await ask('/state', { origin: `http://localhost:${THE_API_PORT}` })
      expect(shown.status).toBe(200)
      expect(shown.headers.get('access-control-allow-origin')).toBe(`http://localhost:${THE_API_PORT}`)
      expect(shown.headers.get('content-type')).toContain('application/json')
      const state = (await shown.json()) as { addresses: string[]; sender: { account: { address: string } | null }; accounts: { unusable: { reason: string }[] } }
      expect(state.addresses).toEqual([A])
      expect(state.sender.account?.address).toBe(SENDER)
      expect(state.accounts.unusable.map((one) => one.reason)).toEqual(['asks a password'])
      // NO PAGE OF ITS OWN: the address that was its page answers that there is no such door.
      expect((await ask('/')).status).toBe(404)
      // A LIST WITH ONE LINE THAT IS NOT AN ADDRESS IS REFUSED WHOLE, WITH A CODE.
      const wrong = (await (await ask('/addresses', { method: 'POST', body: { addresses: `${B}\nnot an address` } })).json()) as { done: unknown }
      expect(wrong.done).toEqual({ saved: false, reason: 'not an address', which: 'not an address' })
      expect(JSON.parse(readFileSync(join(dir, 'addresses.json'), 'utf8'))).toEqual({ addresses: [A] })
      const right = (await (await ask('/addresses', { method: 'POST', body: { addresses: ` ${B}\r\n\r\n${A}\r\n${B}` } })).json()) as { done: unknown; state: { addresses: string[] } }
      expect(right.done).toEqual({ saved: true, addresses: [B, A] })
      expect(right.state.addresses).toEqual([B, A])
      expect(JSON.parse(readFileSync(join(dir, 'addresses.json'), 'utf8'))).toEqual({ addresses: [B, A] })
      // THE TEST PRESS: the test letter to each address, and what became of each.
      const pressed = await ask('/test', { method: 'POST', body: {} })
      expect(pressed.status).toBe(200)
      const after = (await pressed.json()) as { state: { lastTest: { outcome: string; letters: { to: string; outcome: string }[] } } }
      expect(server.letters.map((one) => one.to)).toEqual([[B], [A]])
      for (const letter of server.letters) expect(header(letter.data, 'Subject')).toBe(theTestMail().subject)
      expect(after.state.lastTest).toMatchObject({ outcome: 'sent', letters: [{ to: B, outcome: 'sent' }, { to: A, outcome: 'sent' }] })
      expect(JSON.stringify(after)).not.toContain(THE_TOKEN)
    } finally {
      await doors.close()
      await server.close()
    }
  })

  it('10: sends the login and the letter encrypted over STARTTLS and TLS, and no token where it cannot', async () => {
    const ca = readFileSync(tlsFiles.cert)
    const letter = { to: A, ...theTestMail() }
    const input = { user: SENDER, token: THE_TOKEN, from: SENDER, letters: [letter] }
    const starttls = await new StandInMailServer('starttls').start()
    const tls = await new StandInMailServer('tls').start()
    const plain = await new StandInMailServer('plain, no starttls').start()
    try {
      const overStarttls = await sendLetters({ ...input, ca, server: { host: '127.0.0.1', port: starttls.port, security: 'starttls', says: 'the stand-in' } })
      expect(overStarttls.login, overStarttls.says).toBe('taken')
      expect(starttls.logins).toEqual([{ said: `user=${SENDER}\u0001auth=Bearer ${THE_TOKEN}\u0001\u0001`, overTls: true }])
      expect(starttls.letters.map((one) => one.overTls)).toEqual([true])
      const overTls = await sendLetters({ ...input, ca, server: { host: '127.0.0.1', port: tls.port, security: 'tls', says: 'the stand-in' } })
      expect(overTls.login, overTls.says).toBe('taken')
      expect(tls.letters.map((one) => one.overTls)).toEqual([true])
      // A SERVER THAT OFFERS NO STARTTLS IS SENT NO TOKEN.
      const noOffer = await sendLetters({ ...input, ca, server: { host: '127.0.0.1', port: plain.port, security: 'starttls', says: 'the stand-in' } })
      expect(noOffer.login).toBe('not reached')
      expect(noOffer.letters.map((one) => one.outcome)).toEqual(['later'])
      expect(plain.logins).toEqual([])
      // NOR IS A SERVER WHOSE CERTIFICATE IS NOT TRUSTED.
      const untrusted = await sendLetters({ ...input, server: { host: '127.0.0.1', port: tls.port, security: 'tls', says: 'the stand-in' } })
      expect(untrusted.login).toBe('not reached')
      expect(tls.logins).toHaveLength(1)
    } finally {
      await Promise.all([starttls.close(), tls.close(), plain.close()])
    }
  })

  it('11: names no address, account or server in its log, and never its key or a token', () => {
    expect(log.length).toBeGreaterThan(10)
    const all = log.join('\n')
    expect(all).not.toContain('example.test')
    expect(all).not.toContain('@')
    expect(all).not.toContain(THE_TOKEN)
    expect(all).not.toContain(mailKey)
  })

  it('12: turned back on after the person\'s press turned it off, mails nothing made while it was off, and what comes after', async () => {
    goa({})
    const server = await new StandInMailServer('plain').start()
    try {
      const { tool, place, dir } = aTool({ server, addresses: [A] })
      await tool.round()
      const whileOff = await summon('Made while the tool was off')
      // WHAT THE PERSON'S PRESS THAT TURNS IT OFF LEAVES IN ITS PLACE (disableTheMailTool in src/config/the-mail-tool.mjs).
      writeIntoTheFolder(dir, 'place', `${THE_PLACE_AFTER_THE_NEWEST}\n`)
      await tool.round()
      expect(server.letters, 'a summons made while the tool was off was mailed').toHaveLength(0)
      expect(place()).toBe(whileOff)
      expect(log).toContain(
        'Turned back on after it was turned off: it starts after the newest summons, so nothing made while it was off is mailed; the office keeps every summons.',
      )
      const after = await summon('Made after it was turned back on')
      await tool.round()
      expect(server.letters.map((one) => one.to)).toEqual([[A]])
      expect(header(server.letters[0]?.data ?? '', 'Subject')).toBe(theSummonsMail({ who: 'Secretary One', title: 'Made after it was turned back on', urgency: 'now' }).subject)
      expect(place()).toBe(after)
    } finally {
      await server.close()
    }
  })
  it("13: says at its start which of the office's pages may read its doors, and says it where it happens when the web app's address cannot be read", () => {
    const said: string[] = []
    const say = (line: string) => said.push(line)
    // THE API AND THE WEB APP BOTH READ: four origins, and one line naming the two ports.
    expect(theOriginsAtStart({ api: `http://127.0.0.1:${THE_API_PORT}`, webApp: () => 'http://127.0.0.1:5173', say })).toEqual([
      `http://127.0.0.1:${THE_API_PORT}`, `http://localhost:${THE_API_PORT}`, 'http://127.0.0.1:5173', 'http://localhost:5173',
    ])
    expect(said).toEqual([`Pages the office serves on this computer's ports ${THE_API_PORT} and 5173 may read these doors.`])
    // THE WEB APP'S ADDRESS NOT READ: said where it happens, and only the API's pages may read.
    said.length = 0
    const origins = theOriginsAtStart({ api: `http://127.0.0.1:${THE_API_PORT}`, webApp: () => { throw new Error('MOLE_OFFICE_WEB_PORT is "nine", which is not a port number') }, say })
    expect(origins).toEqual([`http://127.0.0.1:${THE_API_PORT}`, `http://localhost:${THE_API_PORT}`])
    expect(said[0]).toMatch(/^The office's web app address could not be read \(MOLE_OFFICE_WEB_PORT is "nine"/)
    expect(said[0]).toContain('a page served apart, as Vite serves it in development, is refused')
    expect(said[1]).toBe(`Pages the office serves on this computer's port ${THE_API_PORT} may read these doors.`)
    // AND NEVER AN ADDRESS: the lines name ports alone.
    expect(said.join('\n')).not.toMatch(/127\.0\.0\.1|localhost/)
  })
})
