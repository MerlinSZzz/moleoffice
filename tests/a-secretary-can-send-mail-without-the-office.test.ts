// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The explicit command sends supplied mail without an office or daemon. Every account, token and SMTP response here
 * is invented. A process preload refuses credential/settings reads and office calls; an HTTP trap also counts them.
 * The mutation replaces the shared send's supplied letter with a test letter, so the delivered content goes red.
 *
 * A LETTER MAY CARRY ATTACHMENTS, UP TO THE OWNER'S LIMIT IN ALL: the body file
 * and the attachments are counted together, and a letter above the limit is refused in words before any account or
 * server is asked. A big letter takes longer than any fixed clock on a slow connection, so the talk is stopped when
 * nothing passes either way for the tool's longest silence; a letter still going out counts as something passing. A
 * ceiling sized from the letters still stops a server that trickles, so nothing holds the command for ever. Either stop
 * is said in words, before the login as after it. Every limit is read from the code, never written here a second time.
 */
import { execFile } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { theTestMail } from '../src/config/the-summons-mail.mjs'
import {
  THE_CEILING_AT_LEAST_MS, THE_CEILING_MS_A_MEGABYTE, THE_LONGEST_TALK_MS, THE_MOST_LETTER_BYTES, makeTheTool, sendLetters, sendMailToTheList,
  theWholeTalkCeilingMs, xoauth2,
} from '../tools/mail-the-summonses.mjs'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const command = join(root, 'tools/stable/send-mail.mjs')
const sender = 'sender@example.test'
const recipients = ['first@example.test', 'second@example.test', 'third@example.test']
const token = 'invented-token-never-issued'
const subject = 'A supplied update — 邮件'
const body = 'This text was explicitly supplied.\n第二行。\n'
/** Names a mail program shows, which the command must never print: one with the characters RFC 2231 must escape. */
const attachmentNames = ["Mole's private report (第一).txt", 'a private picture 二.bin']
const attachmentText = 'The private attached text.\n附件。\n'
/** Every byte value, so an encoding that changes one is caught. */
const attachmentBytes = Buffer.from(Array.from({ length: 1024 }, (_, at) => at % 256))
const A_MEGABYTE = 1024 * 1024
/** The owner's limit for a letter's body and attachments together, as the command says it: in bytes, then in MB. */
const theLimitInWords = `at most ${THE_MOST_LETTER_BYTES.toLocaleString('en-US')} bytes (${String(THE_MOST_LETTER_BYTES / A_MEGABYTE)} MB)`
const privateValues = [sender, ...recipients, token, xoauth2(sender, token), subject, body.trim(), 'private-account', 'smtp.private.test', ...attachmentNames, attachmentText.trim()]
const privateReply = privateValues.join(' ').replace(/[\r\n]/g, ' ')
/** The lowest port of the machine's ephemeral range, from which Linux picks a port for a listen on port 0. */
const THE_EPHEMERAL_RANGE_STARTS = Number(readFileSync('/proc/sys/net/ipv4/ip_local_port_range', 'utf8').trim().split(/\s+/)[0])
const v = (data: unknown) => ({ data })
function account(id = 'private-account', extra: Record<string, unknown> = {}) {
  return {
    'org.gnome.OnlineAccounts.Account': { Id: v(id), ProviderName: v('invented-provider'), MailDisabled: v(false) },
    'org.gnome.OnlineAccounts.Mail': {
      EmailAddress: v(sender), SmtpSupported: v(true), SmtpHost: v('smtp.private.test'), SmtpUserName: v(sender),
      SmtpUseTls: v(true), SmtpAuthXoauth2: v(true), ...extra,
    },
    'org.gnome.OnlineAccounts.OAuth2Based': {},
  }
}

let scratch: string
let dir: string
let busctl: string
let guard: string
let setup: string
let audit: string
let bodyFile: string
let officeRequests: number
let connections: number
let commands: string[]
let delivered: string[]
let attempts: string[]
let replies: Record<string, number>
let loginCode: number
let breakAfter: number | undefined
let answerDelay: number
let slowReading: number
let silentAfterData: boolean
let greeting: 'at once' | 'never' | 'a byte at a time'
let office: ReturnType<typeof createHttpServer>
let smtp: ReturnType<typeof createServer>
let sockets: Set<Socket>
let env: NodeJS.ProcessEnv

function configure(objects: Record<string, unknown> = { '/org/gnome/OnlineAccounts/Accounts/chosen': account() }, extra: Record<string, unknown> = {}) {
  writeFileSync(setup, JSON.stringify({ objects, token, ...extra }))
}
function saved(names = recipients) {
  writeFileSync(join(dir, 'addresses.json'), JSON.stringify({ addresses: names }))
}
function calls() { return readFileSync(audit, 'utf8').trim().split('\n').filter(Boolean) }
function snapshot() { return Object.fromEntries(readdirSync(dir).map(name => [name, readFileSync(join(dir, name), 'utf8')])) }
/** The parts of a delivered multipart letter: each part's headers and its decoded bytes, the boundary's own lines left out. */
function partsOf(mail: string) {
  const at = mail.indexOf('\r\n\r\n')
  const headers = mail.slice(0, at)
  const boundary = headers.match(/Content-Type: multipart\/mixed;\s+boundary="([^"]+)"/)?.[1]
  if (boundary === undefined) throw new Error('the letter is not multipart/mixed')
  const pieces = mail.slice(at + 4).split(`--${boundary}`)
  expect(pieces.at(-1)!.startsWith('--')).toBe(true)
  return {
    headers,
    parts: pieces.slice(1, -1).map(piece => {
      const [own, encoded] = piece.replace(/^\r\n/, '').split('\r\n\r\n')
      expect(own).toContain('Content-Transfer-Encoding: base64')
      return { headers: own!, bytes: Buffer.from(encoded!.replace(/\r\n/g, ''), 'base64') }
    }),
  }
}
/** The name a mail program shows for an attachment, from its RFC 2231 filename*. */
function nameOf(partHeaders: string) {
  const encoded = partHeaders.match(/filename\*=UTF-8''([^\s;]+)/)?.[1]
  return encoded === undefined ? undefined : decodeURIComponent(encoded)
}
/**
 * Listens on a free port below the ephemeral range, in its lower half, never a port the live-office guard refuses.
 * Linux hands a port of the ephemeral range to every other listen on port 0, so a program that let go of one and still
 * asks at it would be counted as a call. A port below it is reached only by a program that names it. The stand-in
 * holds the port from its first listen: nothing is probed and let go.
 */
async function listenBelowTheEphemeralRange(server: Server) {
  if (!Number.isInteger(THE_EPHEMERAL_RANGE_STARTS) || THE_EPHEMERAL_RANGE_STARTS <= 2048) throw new Error('The ephemeral range could not be read, so the stand-ins cannot listen below it.')
  const lowest = Math.floor(THE_EPHEMERAL_RANGE_STARTS / 2)
  const guarded = new Set(thePortsATestKeepsOff())
  for (let tries = 0; tries < 200; tries++) {
    const chosen = lowest + Math.floor(Math.random() * (THE_EPHEMERAL_RANGE_STARTS - lowest))
    if (guarded.has(chosen)) continue
    const listening = await new Promise<boolean>((resolve, reject) => {
      const listened = () => { server.off('error', refused); resolve(true) }
      const refused = (error: NodeJS.ErrnoException) => { server.off('listening', listened); if (error.code === 'EADDRINUSE') resolve(false); else reject(error) }
      server.once('listening', listened).once('error', refused).listen(chosen, '127.0.0.1')
    })
    if (listening) return
  }
  throw new Error(`No free port was found below the ephemeral range, from ${String(lowest)} to ${String(THE_EPHEMERAL_RANGE_STARTS - 1)}.`)
}
async function run(args = ['--subject', subject, '--body-file', bodyFile], extra: NodeJS.ProcessEnv = {}, program = command) {
  const result = await new Promise<{ code: number | null, out: string, err: string }>((resolve, reject) => {
    execFile(process.execPath, ['--import', guard, program, ...args], { cwd: scratch, env: { ...env, ...extra }, timeout: 15_000 }, (error, stdout, stderr) => {
      if (error && (error.killed || typeof error.code !== 'number')) { reject(error); return }
      resolve({ code: error ? Number(error.code) : 0, out: String(stdout), err: String(stderr) })
    })
  })
  for (const value of privateValues) expect(result.out + result.err).not.toContain(value)
  expect(officeRequests).toBe(0)
  expect(readFileSync(join(scratch, 'forbidden-reads'), 'utf8')).toBe('')
  return result
}

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mail-without-office-'))
  dir = join(scratch, 'mail')
  mkdirSync(dir)
  setup = join(scratch, 'accounts-fixture.json')
  audit = join(scratch, 'account-calls')
  bodyFile = join(scratch, 'body.txt')
  busctl = join(scratch, 'busctl')
  guard = join(scratch, 'guard.mjs')
  writeFileSync(bodyFile, body)
  writeFileSync(audit, '')
  writeFileSync(join(scratch, 'forbidden-reads'), '')
  writeFileSync(join(dir, 'account.json'), JSON.stringify({ id: 'private-account' }))
  writeFileSync(join(dir, 'place'), 'invented-cursor\n')
  saved()
  configure()
  writeFileSync(busctl, `#!${process.execPath}
import { readFileSync, appendFileSync } from 'node:fs';
const s = JSON.parse(readFileSync(process.env.FIXTURE_SETUP, 'utf8'));
const args = process.argv.slice(2);
const tokenCall = args.includes('GetAccessToken');
appendFileSync(process.env.FIXTURE_AUDIT, (tokenCall ? args[4] + ':token' : 'accounts') + '\\n');
if (s.fail || (s.tokenFail && tokenCall)) { process.stderr.write(${JSON.stringify(privateValues.join(' '))}); process.exit(1); }
console.log(JSON.stringify({ data: tokenCall ? [s.token, 3600] : [s.objects] }));
`)
  chmodSync(busctl, 0o700)
  // The preload is used only by the command process; the stand-in busctl reads only its invented configuration.
  writeFileSync(guard, `
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import { basename } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const protectedNames = new Set(['key', 'page-secret', 'page.json', 'place', '.env', 'office.configuration', 'settings.json']);
function check(path) {
  if (protectedNames.has(basename(String(path))) || /\\.(db|sqlite)$/.test(String(path))) {
    fs.appendFileSync(process.env.FORBIDDEN_READS, 'forbidden\\n');
    throw new Error('protected read');
  }
}
for (const name of ['readFileSync', 'readFile', 'openSync', 'open', 'createReadStream']) {
  const original = fs[name]; fs[name] = function(path, ...args) { check(path); return original.call(this, path, ...args); };
}
for (const name of ['readFile', 'open']) {
  const original = fsp[name]; fsp[name] = async function(path, ...args) { check(path); return original.call(this, path, ...args); };
}
syncBuiltinESMExports();
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = typeof first === 'object' ? first : { port: first, host: args[1] };
  if (Number(options.port) !== Number(process.env.FIXTURE_SMTP_PORT) || !['127.0.0.1', 'localhost', '::1'].includes(options.host)) {
    fs.appendFileSync(process.env.FORBIDDEN_READS, 'forbidden network call\\n');
    throw new Error('only the SMTP stand-in may be contacted');
  }
  reached = true;
  return connect.apply(this, args);
};
// THE COMMAND'S CLOCKS RUN FAST once it reaches the mail server, when a case asks, so the case waits out the command's
// real limits in a fraction of their time: each timer and each socket's silence clock is divided by
// FIXTURE_FAST_FROM_THE_CONNECT. Nothing before the connect is changed, and what the command says is still worked out
// from its own limits.
const fast = Number(process.env.FIXTURE_FAST_FROM_THE_CONNECT ?? 1);
let reached = false;
const setTimer = globalThis.setTimeout;
globalThis.setTimeout = function(handler, ms, ...args) { return setTimer(handler, reached ? ms / fast : ms, ...args); };
const setSilence = net.Socket.prototype.setTimeout;
net.Socket.prototype.setTimeout = function(ms, ...args) { return setSilence.call(this, reached ? ms / fast : ms, ...args); };
`)
  officeRequests = 0
  connections = 0
  commands = []
  delivered = []
  attempts = []
  replies = {}
  loginCode = 235
  breakAfter = undefined
  answerDelay = 0
  slowReading = 0
  silentAfterData = false
  greeting = 'at once'
  sockets = new Set()
  office = createHttpServer((_req, res) => { officeRequests++; res.writeHead(503); res.end('office stand-in is unavailable') })
  smtp = createServer(socket => {
    connections++
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => undefined)
    // A SLOW SERVER answers each line late; a silent one never answers the letter's end.
    const write = socket.write.bind(socket)
    socket.write = ((text: string) => {
      if (answerDelay > 0) setTimeout(() => { if (!socket.destroyed) write(text) }, answerDelay)
      else write(text)
      return true
    }) as typeof socket.write
    // A SERVER THAT NEVER GREETS holds the line open and says nothing; one that trickles never ends its greeting.
    if (greeting === 'at once') socket.write('220 invented SMTP\r\n')
    else if (greeting === 'a byte at a time') {
      const trickle = setInterval(() => write('2'), 50)
      socket.on('close', () => clearInterval(trickle))
    }
    let buffer = ''
    let data: string[] | undefined
    socket.on('data', chunk => {
      // A SLOW READER takes the letter a little at a time, so a big letter takes a while to go out.
      if (slowReading > 0 && data !== undefined) { socket.pause(); setTimeout(() => socket.resume(), slowReading) }
      buffer += chunk.toString('utf8')
      let at: number
      while ((at = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, at)
        buffer = buffer.slice(at + 2)
        if (data !== undefined) {
          if (line === '.') {
            delivered.push(data.join('\r\n'))
            data = undefined
            if (!silentAfterData) socket.write('250 accepted\r\n')
          } else data.push(line)
          continue
        }
        commands.push(line)
        if (line.startsWith('EHLO')) socket.write('250 AUTH XOAUTH2\r\n')
        else if (line.startsWith('AUTH')) socket.write(`${loginCode} ${privateReply}\r\n`)
        else if (line.startsWith('MAIL FROM:')) {
          if (breakAfter !== undefined && delivered.length >= breakAfter) socket.destroy()
          else socket.write('250 from accepted\r\n')
        } else if (line.startsWith('RCPT TO:')) {
          const recipient = line.slice('RCPT TO:<'.length, -1)
          attempts.push(recipient)
          socket.write(`${replies[recipient] ?? 250} ${privateReply}\r\n`)
        } else if (line === 'DATA') { data = []; socket.write('354 body\r\n') }
        else if (line === 'QUIT') socket.end('221 done\r\n')
        else socket.write('250 reset\r\n')
      }
    })
  })
  await listenBelowTheEphemeralRange(office)
  await listenBelowTheEphemeralRange(smtp)
  const officeAt = `http://127.0.0.1:${(office.address() as AddressInfo).port}`
  // An allowlist keeps all host model credentials and office configuration out of the child environment.
  env = {
    PATH: process.env.PATH, MAIL_TOOL_DIR: dir, MAIL_TOOL_BUSCTL: busctl,
    MAIL_TOOL_SMTP_SERVER: `smtp://127.0.0.1:${(smtp.address() as AddressInfo).port}`,
    MOLE_OFFICE_API: officeAt, MOLE_OFFICE_WEB_APP: officeAt, MOLE_OFFICE_WORKSPACE: 'invented',
    MOLE_OFFICE_TOOL_CONFIGURATION: join(scratch, 'office.configuration'),
    XDG_STATE_HOME: scratch, XDG_CONFIG_HOME: scratch, FIXTURE_SETUP: setup, FIXTURE_AUDIT: audit,
    FORBIDDEN_READS: join(scratch, 'forbidden-reads'),
    FIXTURE_SMTP_PORT: String((smtp.address() as AddressInfo).port),
  }
})

afterEach(async () => {
  for (const socket of sockets ?? []) socket.destroy()
  if (smtp?.listening) await new Promise<void>((resolve, reject) => smtp.close(error => error ? reject(error) : resolve()))
  if (office?.listening) await new Promise<void>((resolve, reject) => office.close(error => error ? reject(error) : resolve()))
  if (scratch) rmSync(scratch, { recursive: true, force: true })
})

describe('a supplied letter without the office', () => {
  it('sends exact UTF-8 content separately to the saved list, with the saved account, leaving state untouched', async () => {
    configure({ '/org/gnome/OnlineAccounts/Accounts/other': account('other'), '/org/gnome/OnlineAccounts/Accounts/chosen': account() })
    const before = snapshot()
    const result = await run()
    expect(result.code).toBe(0)
    expect(result.out).toContain(`${recipients.length} of ${recipients.length}`)
    expect(connections).toBe(1)
    expect(attempts).toEqual(recipients)
    expect(calls()).toEqual(['accounts', '/org/gnome/OnlineAccounts/Accounts/chosen:token'])
    expect(commands.filter(line => line.startsWith('AUTH'))).toEqual([`AUTH XOAUTH2 ${xoauth2(sender, token)}`])
    expect(delivered).toHaveLength(recipients.length)
    for (const [index, mail] of delivered.entries()) {
      const [headers, encoded] = mail.split('\r\n\r\n')
      const encodedSubject = headers!.match(/Subject: ([\s\S]*?)\r\nDate:/)![1]!
      const decodedSubject = [...encodedSubject.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map(word => Buffer.from(word[1]!, 'base64').toString('utf8')).join('')
      expect(decodedSubject).toBe(subject)
      expect(Buffer.from(encoded!, 'base64').toString('utf8')).toBe(body)
      expect(headers).toContain(`To: <${recipients[index]}>`)
      for (const other of recipients.filter(one => one !== recipients[index])) expect(headers).not.toContain(other)
    }
    expect(snapshot()).toEqual(before)
  })

  it('rejects help, bad arguments and body files before contacting any account or SMTP service', async () => {
    const invalidUtf8 = join(scratch, 'invalid.txt')
    const empty = join(scratch, 'empty.txt')
    writeFileSync(invalidUtf8, Buffer.from([0xc3, 0x28]))
    writeFileSync(empty, ' \n')
    const cases = [[], ['--help'], ['--unknown', token], ['--subject'],
      ['--subject', subject], ['--body-file', bodyFile],
      ['--subject', subject, '--subject', subject, '--body-file', bodyFile],
      ...['', '\nInjected', '   '].map(value => ['--subject', value, '--body-file', bodyFile]),
      ...[join(scratch, 'missing'), dir, empty, invalidUtf8].map(file => ['--subject', subject, '--body-file', file]),
    ]
    for (const args of cases) expect((await run(args)).code).toBe(2)
    expect(calls()).toEqual([])
    expect(connections).toBe(0)
    expect(delivered).toEqual([])
  })

  it('rejects empty or unreadable saved lists before account lookup', async () => {
    saved([])
    expect((await run()).code).toBe(2)
    writeFileSync(join(dir, 'addresses.json'), '{bad private value')
    expect((await run()).code).toBe(2)
    expect(calls()).toEqual([])
    expect(connections).toBe(0)
  })

  it('says which setting is missing, apart from a list saved empty, naming the folder it looked in', async () => {
    saved([])
    const empty = await run()
    rmSync(join(dir, 'addresses.json'))
    const noList = await run()
    rmSync(dir, { recursive: true })
    const noFolder = await run()
    for (const refused of [empty, noList, noFolder]) expect(refused.code).toBe(2)
    // Three facts, three sentences: a list saved empty, a folder with no saved list, and no folder at all.
    expect(new Set([empty.err, noList.err, noFolder.err]).size).toBe(3)
    // A wrong MAIL_TOOL_DIR shows in the refusal itself.
    expect(noList.err).toContain(dir)
    expect(noFolder.err).toContain(dir)
    expect(calls()).toEqual([])
    expect(connections).toBe(0)
    expect(delivered).toEqual([])
  })


  it('fails explicitly for unavailable, unselected, insecure and broken accounts or tokens', async () => {
    configure({})
    expect((await run()).code).toBe(1)
    configure({ '/a': account('a'), '/b': account('b') })
    expect((await run()).code).toBe(1)
    configure({ '/a': account('a', { SmtpUseTls: v(false) }) })
    expect((await run()).code).toBe(1)
    configure(undefined, { fail: true })
    expect((await run()).code).toBe(1)
    configure(undefined, { tokenFail: true })
    expect((await run()).code).toBe(1)
    configure(undefined, { token: '' })
    expect((await run()).code).toBe(1)
    expect(connections).toBe(0)
    expect(delivered).toEqual([])
  })

  it('reports authentication refusal and total, partial and interrupted delivery without retry or private output', async () => {
    loginCode = 535
    expect((await run()).code).toBe(1)
    expect(attempts).toEqual([])
    expect(delivered).toEqual([])
    loginCode = 235
    replies = Object.fromEntries(recipients.map(one => [one, 550]))
    expect((await run()).err).toContain(`accepted 0 of ${recipients.length}`)
    expect(attempts).toEqual(recipients)
    attempts = []
    replies = { [recipients[1]!]: 550, [recipients[2]!]: 451 }
    const partial = await run()
    expect(partial.code).toBe(1)
    expect(partial.err).toContain('Partial delivery')
    expect(partial.err).toContain('refused 1; unconfirmed 1')
    expect(attempts).toEqual(recipients)
    expect(delivered).toHaveLength(1)
    delivered = []
    attempts = []
    replies = {}
    breakAfter = 1
    const broken = await run()
    expect(broken.code).toBe(1)
    expect(broken.err).toContain(`accepted 1 of ${recipients.length}`)
    expect(delivered).toHaveLength(1)
    expect(connections).toBe(4)
  })

  it('keeps real-account TLS requirements and refuses a remote plaintext override before token retrieval', async () => {
    configure({ '/a': account('a', { SmtpHost: v(`127.0.0.1:${(smtp.address() as AddressInfo).port}`) }) })
    // The stand-in advertises no STARTTLS. No AUTH or DATA may cross its plaintext connection.
    const result = await run(undefined, { MAIL_TOOL_SMTP_SERVER: '' })
    expect(result.code).toBe(1)
    expect(commands.some(line => line.startsWith('AUTH'))).toBe(false)
    expect(delivered).toEqual([])
    const before = calls().length
    expect((await run(undefined, { MAIL_TOOL_SMTP_SERVER: 'smtp://remote.example.test:25' })).code).toBe(1)
    expect(calls().slice(before)).toEqual(['accounts'])
    expect(connections).toBe(1)
  })

  it('imports the shared sender without starting a service and keeps the Settings test-letter contract', async () => {
    const importOnly = join(scratch, 'import-only.mjs')
    writeFileSync(importOnly, `await import(${JSON.stringify(pathToFileURL(join(root, 'tools/mail-the-summonses.mjs')).href)});`)
    expect((await run([], {}, importOnly)).code).toBe(0)
    expect(calls()).toEqual([])
    expect(connections).toBe(0)
    const tool = makeTheTool({ dir, api: env.MOLE_OFFICE_API!, busctl, smtpServer: env.MAIL_TOOL_SMTP_SERVER, say: () => undefined })
    // These in-process calls pass only fixture paths; busctl is still the invented account service.
    const oldSetup = process.env.FIXTURE_SETUP
    const oldAudit = process.env.FIXTURE_AUDIT
    process.env.FIXTURE_SETUP = setup
    process.env.FIXTURE_AUDIT = audit
    try {
      const result = await tool.sendATest()
      expect(result.outcome).toBe('sent')
      expect(result.letters.every(one => one.outcome === 'sent')).toBe(true)
      expect(delivered).toHaveLength(recipients.length)
      expect(Buffer.from(delivered[0]!.split('\r\n\r\n')[1]!, 'base64').toString('utf8')).toBe(theTestMail().body)
      delivered = []
      const direct = await sendMailToTheList({ dir, busctl, smtpServer: env.MAIL_TOOL_SMTP_SERVER }, { subject, body }, [recipients[0]!])
      expect('letters' in direct && direct.letters[0]?.outcome).toBe('sent')
      expect(officeRequests).toBe(0)
    } finally {
      if (oldSetup === undefined) delete process.env.FIXTURE_SETUP; else process.env.FIXTURE_SETUP = oldSetup
      if (oldAudit === undefined) delete process.env.FIXTURE_AUDIT; else process.env.FIXTURE_AUDIT = oldAudit
    }
  })

  it('sends attachments beside the body, each under its own name with its exact bytes, leaving state untouched', async () => {
    const [textFile, bytesFile] = attachmentNames.map(name => join(scratch, name))
    writeFileSync(textFile!, attachmentText)
    writeFileSync(bytesFile!, attachmentBytes)
    const before = snapshot()
    const result = await run(['--subject', subject, '--body-file', bodyFile, '--attach', textFile!, '--attach', bytesFile!])
    expect(result.code).toBe(0)
    expect(attempts).toEqual(recipients)
    expect(delivered).toHaveLength(recipients.length)
    for (const [index, mail] of delivered.entries()) {
      const { headers, parts } = partsOf(mail)
      expect(headers).toContain(`To: <${recipients[index]}>`)
      expect(parts).toHaveLength(3)
      expect(parts[0]!.headers).toContain('Content-Type: text/plain; charset=UTF-8')
      expect(parts[0]!.bytes.toString('utf8')).toBe(body)
      expect(nameOf(parts[0]!.headers)).toBeUndefined()
      expect(parts.slice(1).map(part => nameOf(part.headers))).toEqual(attachmentNames)
      expect(parts.slice(1).every(part => /Content-Disposition: attachment;/.test(part.headers))).toBe(true)
      expect(parts[1]!.bytes.toString('utf8')).toBe(attachmentText)
      expect(parts[2]!.bytes.equals(attachmentBytes)).toBe(true)
    }
    expect(snapshot()).toEqual(before)
  })

  it('keeps a letter without attachments a single text part, as the summonses and the test letter are', async () => {
    expect((await run()).code).toBe(0)
    for (const mail of delivered) {
      expect(mail).toContain('Content-Type: text/plain; charset=UTF-8')
      expect(mail).not.toContain('multipart')
    }
  })

  it('refuses a letter above the limit in all, in words, before any account or mail server, and takes one of exactly the limit', async () => {
    const bodyBytes = Buffer.byteLength(body, 'utf8')
    const big = join(scratch, attachmentNames[1]!)
    const second = join(scratch, attachmentNames[0]!)
    // The body counts: an attachment one byte short of the limit on its own is over it with the body beside it.
    writeFileSync(big, '')
    truncateSync(big, THE_MOST_LETTER_BYTES - bodyBytes + 1)
    const over = await run(['--subject', subject, '--body-file', bodyFile, '--attach', big])
    // Two attachments under the limit each are over it together.
    truncateSync(big, THE_MOST_LETTER_BYTES / 2)
    writeFileSync(second, '')
    truncateSync(second, THE_MOST_LETTER_BYTES / 2)
    const both = await run(['--subject', subject, '--body-file', bodyFile, '--attach', big, '--attach', second])
    for (const refused of [over, both]) {
      expect(refused.code).toBe(2)
      expect(refused.err).toContain(theLimitInWords)
      expect(refused.err).toContain('Nothing was sent.')
    }
    expect(calls()).toEqual([])
    expect(connections).toBe(0)
    // Exactly the limit goes to the mail server. The stand-in refuses the recipient, so the big letter never crosses the socket.
    truncateSync(big, THE_MOST_LETTER_BYTES - bodyBytes)
    saved([recipients[0]!])
    replies = { [recipients[0]!]: 552 }
    const atTheLimit = await run(['--subject', subject, '--body-file', bodyFile, '--attach', big])
    expect(atTheLimit.code).toBe(1)
    expect(atTheLimit.err).not.toContain(theLimitInWords)
    // The server's own words can name the account, so the command says only that it refused, and why it may have.
    expect(atTheLimit.err).toContain("The account's mail server refused 1.")
    expect(atTheLimit.err).toContain(`Some mail servers take less than ${String(THE_MOST_LETTER_BYTES / A_MEGABYTE)} MB`)
    expect(attempts).toEqual([recipients[0]])
  })

  it('refuses an attachment that is missing, a folder or given no file, without naming it, before contacting anything', async () => {
    const missing = join(scratch, attachmentNames[0]!)
    for (const extra of [['--attach'], ['--attach', missing], ['--attach', dir], ['--attach', '']]) {
      expect((await run(['--subject', subject, '--body-file', bodyFile, ...extra])).code).toBe(2)
    }
    expect(calls()).toEqual([])
    expect(connections).toBe(0)
    expect(delivered).toEqual([])
  })

  it('waits on a mail server while something passes, however long the talk, and stops one that says nothing', async () => {
    const server = { host: '127.0.0.1', port: (smtp.address() as AddressInfo).port, security: 'plain' as const, says: 'the stand-in' }
    const letter = { to: recipients[0]!, subject, body }
    const outcomes = (sent: Awaited<ReturnType<typeof sendLetters>>) => sent.letters.map(one => one.outcome)
    // Eight answers 150 ms late make a talk of more than a second, with no silence as long as half a second.
    answerDelay = 150
    const slow = await sendLetters({ server, user: sender, token, from: sender, letters: [letter], limits: { silenceMs: 500 } })
    expect(outcomes(slow)).toEqual(['sent'])
    expect(slow.cut).toBeNull()
    answerDelay = 0
    // An 8 MB letter that the stand-in reads a little at a time takes about four seconds to go out, twice the limit on
    // silence, and its bytes keep moving. After its last byte is handed over, the letter waits in this computer's
    // buffers until the stand-in has read it; that wait was under one second when measured, so the limit here is two.
    slowReading = 25
    const attachments = [{ name: attachmentNames[1]!, content: Buffer.alloc(8 * 1024 * 1024, 7) }]
    const started = Date.now()
    expect(outcomes(await sendLetters({ server, user: sender, token, from: sender, letters: [{ ...letter, attachments }], limits: { silenceMs: 2000 } }))).toEqual(['sent'])
    expect(Date.now() - started).toBeGreaterThan(2000)
    expect(partsOf(delivered.at(-1)!).parts[1]!.bytes.equals(attachments[0]!.content)).toBe(true)
    slowReading = 0
    // A server that never answers the letter's end is let go after half a second of silence, and the letter is unconfirmed.
    silentAfterData = true
    const waited = Date.now()
    const silent = await sendLetters({ server, user: sender, token, from: sender, letters: [letter], limits: { silenceMs: 500 } })
    expect(outcomes(silent)).toEqual(['later'])
    expect(silent.cut).toEqual({ why: 'silence', seconds: 0.5 })
    expect(Date.now() - waited).toBeLessThan(5000)
  })

  it('stops a server that trickles at a ceiling sized from the letters, which grows with each megabyte they carry', async () => {
    expect(theWholeTalkCeilingMs([{ to: recipients[0]!, subject, body: '' }])).toBe(THE_CEILING_AT_LEAST_MS)
    const aMegabyte = { name: attachmentNames[1]!, content: Buffer.alloc(A_MEGABYTE) }
    expect(theWholeTalkCeilingMs([{ to: recipients[0]!, subject, body: '', attachments: [aMegabyte, aMegabyte] }])).toBe(THE_CEILING_AT_LEAST_MS + 2 * THE_CEILING_MS_A_MEGABYTE)
    // Every letter of the talk counts, the body as much as an attachment. Three letters at the limit:
    const atTheLimit = { to: recipients[0]!, subject, body: 'x'.repeat(A_MEGABYTE), attachments: [{ name: 'n', content: Buffer.alloc(THE_MOST_LETTER_BYTES - A_MEGABYTE) }] }
    expect(theWholeTalkCeilingMs([atTheLimit, atTheLimit, atTheLimit])).toBe(THE_CEILING_AT_LEAST_MS + (3 * THE_MOST_LETTER_BYTES / A_MEGABYTE) * THE_CEILING_MS_A_MEGABYTE)
    // Answers 150 ms apart never leave half a second of silence, and the talk is stopped at its ceiling of 0.6 seconds.
    const server = { host: '127.0.0.1', port: (smtp.address() as AddressInfo).port, security: 'plain' as const, says: 'the stand-in' }
    answerDelay = 150
    const started = Date.now()
    const held = await sendLetters({ server, user: sender, token, from: sender, letters: [{ to: recipients[0]!, subject, body }], limits: { silenceMs: 500, ceilingMs: 600 } })
    expect(held.letters.map(one => one.outcome)).toEqual(['later'])
    expect(held.cut).toEqual({ why: 'ceiling', seconds: 0.6 })
    expect(Date.now() - started).toBeLessThan(3000)
    expect(delivered).toEqual([])
  })

  it('says which limit stopped a talk before the login: a server that never greets, and one that greets a byte at a time', async () => {
    const server = { host: '127.0.0.1', port: (smtp.address() as AddressInfo).port, security: 'plain' as const, says: 'the stand-in' }
    const letters = [{ to: recipients[0]!, subject, body }]
    greeting = 'never'
    const silent = await sendLetters({ server, user: sender, token, from: sender, letters, limits: { silenceMs: 500 } })
    expect(silent.login).toBe('not reached')
    expect(silent.cut).toEqual({ why: 'silence', seconds: 0.5 })
    expect(silent.short).toContain('nothing passed for 0.5 seconds')
    greeting = 'a byte at a time'
    const trickled = await sendLetters({ server, user: sender, token, from: sender, letters, limits: { silenceMs: 500, ceilingMs: 600 } })
    expect(trickled.login).toBe('not reached')
    expect(trickled.cut).toEqual({ why: 'ceiling', seconds: 0.6 })
    expect(trickled.short).toContain('its ceiling of 0.6 seconds')
    // The command's own limits, its clocks run twenty times fast from the connect, so it names the real ones.
    const fast = { FIXTURE_FAST_FROM_THE_CONNECT: '20' }
    greeting = 'never'
    const neverGreeted = await run(undefined, fast)
    expect(neverGreeted.code).toBe(1)
    expect(neverGreeted.err).toContain(`Nothing passed between this computer and the mail server for ${String(THE_LONGEST_TALK_MS / 1000)} seconds, so the talk was stopped. Nothing was sent.`)
    greeting = 'a byte at a time'
    const neverEnded = await run(undefined, fast)
    const ceilingMs = theWholeTalkCeilingMs(recipients.map(to => ({ to, subject, body })))
    expect(neverEnded.code).toBe(1)
    expect(neverEnded.err).toContain(`The talk went past ${String(ceilingMs / 1000)} seconds, the most these letters are given, so it was stopped. Nothing was sent.`)
    expect(commands).toEqual([])
    expect(delivered).toEqual([])
  })

})
