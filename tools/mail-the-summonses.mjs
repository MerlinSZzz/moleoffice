#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * MAIL THE SUMMONSES: A TOOL THAT READS EACH SUMMONS WITH A KEY OF ITS OWN AND MAILS IT, FROM THE MAIL ACCOUNT LOGGED IN
 * ON THIS COMPUTER. It comes from four decisions of 26 and 27 September
 * 2026.
 *
 *     node tools/mail-the-summonses.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * WHY IT IS A TOOL AND NOT THE OFFICE
 * ---------------------------------------------------------------------------------------------
 *
 * The office only summons: a message to them and a push to their devices. Mail is one way out among several,
 * so it is a tool that whoever wants it installs, and the office holds no mail setting. The tool reads the summonses
 * with their personal tool key, which proves only this mail tool and reads nothing else. Two decisions on H-forI_Vk5H7
 * change an earlier decision: the mail tool is no longer an agent on the mailer
 * card. The office never starts it: a press on the Settings
 * page installs it as a service of their own login, by point (i) of a decision, and nobody runs this line in a
 * terminal.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT DOES
 * ---------------------------------------------------------------------------------------------
 *
 * Every 20 seconds it asks the office for the summonses since the last one it finished, and mails each to every address
 * on its list, one letter to each address so nobody on the list sees another's address, in the one letter of
 * src/config/the-summons-mail.mjs. IT MOVES ITS PLACE PAST A SUMMONS ONLY ONCE EVERY ADDRESS HAS IT, or the mail server
 * refused it for good: a letter that could not go now is tried again on the next round, to the addresses still
 * waiting. A summons the office cannot read is mailed as exactly that, naming it and guessing nothing (problem
 * 3E3Ygyzz-zwO), and the tool reads on after it. A key the office no longer takes stops the reading, and their Settings
 * page says so until a new key is in the folder.
 *
 * WHICH ADDRESSES ALREADY HAVE A SUMMONS IS KEPT WHILE IT RUNS, and not in its folder: a restart between a round that
 * reached some of the list and the round that reaches the rest mails those first addresses a second time. A second
 * letter is the side it errs on; a lost one would be the other.
 *
 * ON ITS FIRST START IT MAILS NOTHING MADE BEFORE IT: it takes its place after the newest summons, so installing it does
 * not mail them every summons there ever was. TURNED BACK ON after their press turned it off, it does the same, so it mails
 * nothing made while it was off: that press leaves its place saying so
 * (THE_PLACE_AFTER_THE_NEWEST), and the office keeps every summons as a message either way. An empty list of addresses
 * is allowed: the summonses are then read and passed over, and none is mailed later when an address is
 * added.
 *
 * ---------------------------------------------------------------------------------------------
 * WHERE IT SENDS FROM: THE ACCOUNT LOGGED IN ON THIS COMPUTER
 * ---------------------------------------------------------------------------------------------
 *
 * GNOME Online Accounts, read over D-Bus with busctl: an account with Mail on whose mail server takes an OAuth2 token
 * (XOAUTH2), reached over TLS or STARTTLS. A token is asked for at each send and dropped after it: the tool keeps no
 * password and no token, and nothing of the account but which one they picked. With one such account it is the one;
 * with several they pick one on their Settings page. The token can read that mailbox as well, which is why they log in a bell
 * account with nothing but Mail on.
 *
 * ---------------------------------------------------------------------------------------------
 * ITS DOORS FOR THEIR SETTINGS PAGE, AND WHY THEY HAVE A SECRET
 * ---------------------------------------------------------------------------------------------
 *
 * It keeps no page of its own and opens no window. The mail tool's entry in the Tools category of their Settings page
 * reads it, changes the list of addresses and the account, and presses "send a test", by asking the tool itself on
 * 127.0.0.1, so no address passes through the office, under a decision and plan
 * 9y8_m1dheYm_. It answers in JSON:
 * data and codes, never a sentence of its own, since the Settings page draws every word from its word lists in their
 * language. What a mail server or the office said is handed on as it was said, for developer mode.
 *
 * A sandbox runs with this computer's network, so a door open to 127.0.0.1 is open to every sandbox: every request
 * must carry the secret, in the x-mail-tool-secret header, which only the tool's folder and their own door on the
 * office hold. Never a cookie, because a browser sends a cookie for 127.0.0.1 to every port on it, and never the
 * address, which a browser keeps in its history. A browser page reads an answer only when it comes from the office's
 * own address (CORS), and a request that names another host is refused before anything else, so a name rebound to
 * this computer reaches nothing.
 *
 * ---------------------------------------------------------------------------------------------
 * ITS FOLDER, AND WHAT NEVER LEAVES IT
 * ---------------------------------------------------------------------------------------------
 *
 * MAIL_TOOL_DIR, or ~/.local/state/mole-office/mail-the-summonses, mode 700, each file 600: `key` (its office key),
 * `page-secret` (the doors' secret), `addresses.json`, `account.json` (the account they picked, when there are several),
 * `place` (the last summons finished; empty for "from the first"), `page.json` (the doors' port, which their door on the
 * office hands their Settings page with the secret). No sandbox mounts it.
 *
 * ITS LOG NAMES A SUMMONS BY ID AND TITLE, AND NEVER A KEY, A TOKEN, A LETTER'S BODY OR ATTACHMENT (ITS NAME AS
 * WELL), AN ADDRESS, AN ACCOUNT OR A SERVER: none of these may leak. What a mail server answered, and which account and server
 * it sends through, are shown on their Settings page alone.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT A TEST MAY CHANGE
 * ---------------------------------------------------------------------------------------------
 *
 * MAIL_TOOL_BUSCTL names a stand-in for busctl, and MAIL_TOOL_SMTP_SERVER a stand-in mail server, which is taken only as
 * smtp:// on this computer: the real mail goes to the account's own server, over TLS. Both are for tests; nothing in
 * them touches their account.
 */

import { execFile } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { connect as connectPlain, isIP } from 'node:net'
import { join, resolve } from 'node:path'
import { connect as connectTls } from 'node:tls'
import { fileURLToPath } from 'node:url'

import { localStampOf } from '../src/config/stopped-run-cause.mjs'
// ITS FOLDER IS NAMED IN ONE PLACE, which the press that installs it reads too; and so is
// what the press that turns it off leaves in its place.
import { THE_PLACE_AFTER_THE_NEWEST, theMailToolFolder } from '../src/config/the-mail-tool.mjs'
import {
  AN_ADDRESS,
  theMessage,
  theSummonsMail,
  theTestMail,
  theUnreadableSummonsMail,
  withoutAddresses,
} from '../src/config/the-summons-mail.mjs'

/** How often it asks the office for new summonses. */
export const EVERY_MS = 20_000

/**
 * How long one question to the office or to D-Bus may take, and how long a conversation with a mail server may pass
 * nothing either way. A conversation is not limited to it in all, since a letter of 50 MB takes longer than that to go
 * out on a slow connection; its whole length has the ceiling below.
 */
export const THE_LONGEST_TALK_MS = 20_000

/**
 * THE MOST A LETTER MAY CARRY, its body and attachments together: 50 MB. The
 * account's own server may take less; Gmail takes about 25 MB of attachments.
 */
export const THE_MOST_LETTER_BYTES = 50 * 1024 * 1024

/**
 * THE CEILING OF ONE CONVERSATION, so a server that answers a byte at a time cannot hold the tool for ever: 60 seconds,
 * and 15 seconds more for each megabyte the letters carry (body and attachments, before encoding). Fifteen seconds a
 * megabyte is about 90 KB a second once the letter is base64, slower than any working connection. Three letters of
 * 50 MB are given 38 minutes and a half.
 */
export const THE_CEILING_AT_LEAST_MS = 60_000
export const THE_CEILING_MS_A_MEGABYTE = 15_000

/** @param {ALetter[]} letters */
export function theWholeTalkCeilingMs(letters) {
  const bytes = letters.reduce(
    (sum, one) => sum + Buffer.byteLength(one.body, 'utf8') + (one.attachments ?? []).reduce((inAll, file) => inAll + file.content.length, 0),
    0,
  )
  return THE_CEILING_AT_LEAST_MS + Math.ceil((THE_CEILING_MS_A_MEGABYTE * bytes) / (1024 * 1024))
}

/** How many reads one round makes at most, so a round ends; what is left is read on the next. */
const THE_MOST_READS_IN_A_ROUND = 20

/** How many lines of what it did it keeps, for their Settings page in developer mode. */
const THE_EVENTS_KEPT = 30

const GOA = 'org.gnome.OnlineAccounts'

// ============================================================================================ the folder

/** @param {string} dir */
export function makeTheFolder(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
}

/**
 * One file of the folder as text, or null when it is not there.
 * @param {string} dir
 * @param {string} name
 */
function readFromTheFolder(dir, name) {
  try {
    return readFileSync(join(dir, name), 'utf8')
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return null
    throw err
  }
}

/**
 * One file of the folder written whole, readable by this user alone, through a rename, so a reader never sees half.
 * @param {string} dir
 * @param {string} name
 * @param {string} text
 */
export function writeIntoTheFolder(dir, name, text) {
  const beside = join(dir, `.${name}.${String(process.pid)}.new`)
  writeFileSync(beside, text, { mode: 0o600 })
  chmodSync(beside, 0o600)
  renameSync(beside, join(dir, name))
}

/**
 * One JSON file of the folder, undefined when it is not there (no JSON text reads as undefined), or a refusal in fixed
 * words: a JSON error quotes the text it could not read, and this text holds their addresses.
 * @param {string} dir
 * @param {string} name
 * @returns {unknown}
 */
function readJsonFromTheFolder(dir, name) {
  const text = readFromTheFolder(dir, name)
  if (text === null) return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${name} in the mail tool's folder is not JSON, so it was not read`)
  }
}

/**
 * THE LIST OF ADDRESSES, as their Settings page saved it; empty when none was saved.
 * @param {string} dir
 * @returns {string[]}
 */
export function theAddresses(dir) {
  return theSavedAddresses(dir) ?? []
}

/**
 * THE LIST AS SAVED, or null when the folder holds no saved list, or there is no folder. A command that refuses to send
 * tells a list nobody saved from a list saved empty.
 * @param {string} dir
 * @returns {string[] | null}
 */
export function theSavedAddresses(dir) {
  const read = readJsonFromTheFolder(dir, 'addresses.json')
  if (read === undefined) return null
  const list = read !== null && typeof read === 'object' ? /** @type {{ addresses?: unknown }} */ (read).addresses : undefined
  return Array.isArray(list) ? list.filter((one) => typeof one === 'string' && AN_ADDRESS.test(one)) : []
}

/**
 * WHERE IT READS ON FROM: undefined before its first start, '' for "from the first summons", the id of the last one it
 * finished, or THE_PLACE_AFTER_THE_NEWEST, which the press that turns it off leaves: start after the newest summons.
 * @param {string} dir
 * @returns {string | undefined}
 */
function thePlace(dir) {
  const text = readFromTheFolder(dir, 'place')
  return text === null ? undefined : text.trim()
}

/** The most addresses the list holds. */
export const THE_MOST_ADDRESSES = 50

/**
 * THE LIST WRITTEN FROM WHAT THEY TYPED, one address a line; blank lines are passed over. A line that is not one address
 * refuses the whole list, and nothing is written. A refusal is a code, with what it is about, for their Settings page to
 * word.
 * @param {string} dir
 * @param {string} typed
 * @returns {{ saved: true, addresses: string[] }
 *   | { saved: false, reason: 'not an address', which: string }
 *   | { saved: false, reason: 'too many', count: number, most: number }}
 */
export function saveTheAddresses(dir, typed) {
  const lines = typed
    .split(/\r?\n/)
    .map((one) => one.trim())
    .filter((one) => one !== '')
  const wrong = lines.find((one) => !AN_ADDRESS.test(one))
  if (wrong !== undefined) return { saved: false, reason: 'not an address', which: wrong }
  const addresses = [...new Set(lines)]
  if (addresses.length > THE_MOST_ADDRESSES) return { saved: false, reason: 'too many', count: addresses.length, most: THE_MOST_ADDRESSES }
  writeIntoTheFolder(dir, 'addresses.json', `${JSON.stringify({ addresses }, null, 2)}\n`)
  return { saved: true, addresses }
}

// ============================================================================================ the office

/**
 * @typedef {{ id: string, at: string, who: string, urgency: 'now' | 'soon', title: string }} ASummons
 * @typedef {{ kind: 'read', summonses: ASummons[] }
 *   | { kind: 'unreadable', id: string }
 *   | { kind: 'key refused', says: string }
 *   | { kind: 'place lost', says: string }
 *   | { kind: 'unreachable', says: string }} ARead
 */

/**
 * ONE READ OF THE SUMMONSES SINCE `after`, as the office answers it, with the tool's own key and nothing else.
 * `after` null reads from the first. A summons the office cannot read comes back as a refusal naming it, with the way
 * to read on after it (lib/summons.ts, theSummonsesSince), and is handed on as `unreadable`.
 * @param {{ api: string, key: string, after: string | null }} input
 * @returns {Promise<ARead>}
 */
export async function readTheSummonses(input) {
  const url = `${input.api}/api/office/summonses${input.after === null ? '' : `?after=${encodeURIComponent(input.after)}`}`
  /** @type {Response} */
  let reply
  /** @type {string} */
  let text
  try {
    reply = await fetch(url, { headers: { 'x-mole-office-key': input.key }, signal: AbortSignal.timeout(THE_LONGEST_TALK_MS) })
    text = await reply.text()
  } catch (err) {
    return { kind: 'unreachable', says: `the office did not answer (${err instanceof Error ? err.message : String(err)})` }
  }
  /** @type {any} */
  let said = null
  try {
    said = JSON.parse(text)
  } catch {
    said = null
  }
  if (reply.status === 200 && said !== null && Array.isArray(said.summonses)) return { kind: 'read', summonses: said.summonses }
  const error = typeof said?.error === 'string' ? said.error : text.slice(0, 300)
  if (reply.status === 401 || reply.status === 403) return { kind: 'key refused', says: error }
  if (reply.status === 404 && input.after !== null) return { kind: 'place lost', says: error }
  const unreadable = reply.status === 500 ? /\?after=([A-Za-z0-9_-]{1,64})/.exec(error) : null
  if (unreadable !== null && unreadable[1] !== undefined) return { kind: 'unreadable', id: unreadable[1] }
  return { kind: 'unreachable', says: `the office answered ${String(reply.status)}: ${error}` }
}

// ============================================================================================ the account

/**
 * @typedef {object} Account
 * @property {string} id  its Id in GNOME Online Accounts, which is what a choice on Settings keeps
 * @property {string} path  its object on D-Bus
 * @property {string} provider  as GNOME Online Accounts names it, "Google"
 * @property {string} address  the address it sends from
 * @property {string} user  the name it logs in to the mail server with
 * @property {string} host
 * @property {number | null} port  as the account names it, or null for the usual one
 * @property {'tls' | 'starttls'} security  TLS from the first byte, or STARTTLS
 *
 * @typedef {'no address' | 'no mail server' | 'asks a password' | 'not encrypted' | 'log in again'} WhyItCannotSend
 * @typedef {{ usable: Account[], unusable: { name: string, provider: string, reason: WhyItCannotSend }[] }} TheAccounts
 */

/**
 * ONE CALL TO GNOME ONLINE ACCOUNTS through busctl, answered as busctl's JSON. What it printed is never put in an error,
 * since a token is what one call prints.
 * @param {string} busctl
 * @param {string[]} args
 * @returns {Promise<any>}
 */
function callTheAccounts(busctl, args) {
  return new Promise((done, failed) => {
    execFile(
      busctl,
      ['--user', '--json=short', 'call', GOA, ...args],
      { timeout: THE_LONGEST_TALK_MS, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err !== null) {
          const why = String(stderr).split('\n').find((line) => line.trim() !== '') ?? (err.code === 'ENOENT' ? `there is no ${busctl}` : 'no reason given')
          failed(new Error(`GNOME Online Accounts did not answer (${withoutAddresses(why.trim()).slice(0, 200)})`))
          return
        }
        try {
          done(JSON.parse(stdout))
        } catch {
          failed(new Error('GNOME Online Accounts answered something that is not what busctl prints'))
        }
      },
    )
  })
}

/**
 * A property's value as busctl prints it ({"type":"s","data":…}), or undefined.
 * @param {any} face
 * @param {string} name
 */
function valueOf(face, name) {
  const held = face?.[name]
  return held !== null && typeof held === 'object' ? held.data : undefined
}

/**
 * The host and port an account's SmtpHost names: "smtp.example.com", "smtp.example.com:587" or "[::1]:25".
 * @param {string} named
 * @returns {{ host: string, port: number | null }}
 */
function hostAndPort(named) {
  const bracketed = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(named)
  if (bracketed !== null) return { host: String(bracketed[1]), port: bracketed[2] === undefined ? null : Number(bracketed[2]) }
  const plain = /^([^:\s]+)(?::(\d{1,5}))?$/.exec(named)
  if (plain !== null) return { host: String(plain[1]), port: plain[2] === undefined ? null : Number(plain[2]) }
  return { host: named, port: null }
}

/**
 * EVERY ACCOUNT LOGGED IN ON THIS COMPUTER WITH MAIL ON: those it can send through, and those it cannot, with why. An
 * account with Mail off is not listed at all.
 * @param {string} busctl
 * @returns {Promise<TheAccounts>}
 */
export async function theAccounts(busctl) {
  const answer = await callTheAccounts(busctl, ['/org/gnome/OnlineAccounts', 'org.freedesktop.DBus.ObjectManager', 'GetManagedObjects'])
  const objects = Array.isArray(answer?.data) ? answer.data[0] : undefined
  if (objects === null || typeof objects !== 'object') throw new Error('GNOME Online Accounts answered something that is not a list of accounts')
  /** @type {TheAccounts} */
  const found = { usable: [], unusable: [] }
  for (const [path, faces] of Object.entries(/** @type {Record<string, any>} */ (objects))) {
    const account = faces?.[`${GOA}.Account`]
    const mail = faces?.[`${GOA}.Mail`]
    if (account === undefined || mail === undefined || valueOf(account, 'MailDisabled') === true) continue
    const address = String(valueOf(mail, 'EmailAddress') ?? '')
    const provider = String(valueOf(account, 'ProviderName') ?? '')
    const name = address !== '' ? address : String(valueOf(account, 'PresentationIdentity') ?? path)
    /** @param {WhyItCannotSend} reason */
    const cannot = (reason) => found.unusable.push({ name, provider, reason })
    if (!AN_ADDRESS.test(address)) {
      cannot('no address')
      continue
    }
    if (valueOf(mail, 'SmtpSupported') !== true || String(valueOf(mail, 'SmtpHost') ?? '') === '') {
      cannot('no mail server')
      continue
    }
    // THE TOOL KEEPS NO PASSWORD, so a server that asks one cannot be sent through.
    if (faces?.[`${GOA}.OAuth2Based`] === undefined || valueOf(mail, 'SmtpAuthXoauth2') !== true) {
      cannot('asks a password')
      continue
    }
    // A TOKEN IS NEVER SENT IN THE CLEAR.
    const security = valueOf(mail, 'SmtpUseSsl') === true ? 'tls' : valueOf(mail, 'SmtpUseTls') === true ? 'starttls' : null
    if (security === null) {
      cannot('not encrypted')
      continue
    }
    if (valueOf(account, 'AttentionNeeded') === true) {
      cannot('log in again')
      continue
    }
    const { host, port } = hostAndPort(String(valueOf(mail, 'SmtpHost')))
    found.usable.push({
      id: String(valueOf(account, 'Id') ?? path),
      path,
      provider,
      address,
      user: String(valueOf(mail, 'SmtpUserName') ?? '') || address,
      host,
      port,
      security,
    })
  }
  return found
}

/**
 * THE ACCOUNT IT SENDS FROM: the one they picked while it can send, or the only one that can. `reason` is for their
 * Settings page to word, with how many can send; `short` is for the log, which names no account.
 * @param {TheAccounts} accounts
 * @param {string | null} picked
 * @returns {{ account: Account } | { account: null, reason: 'no account' | 'pick one', count: number, short: string }}
 */
export function theSender(accounts, picked) {
  const chosen = picked === null ? undefined : accounts.usable.find((one) => one.id === picked)
  if (chosen !== undefined) return { account: chosen }
  if (accounts.usable.length === 1 && accounts.usable[0] !== undefined) return { account: accounts.usable[0] }
  if (accounts.usable.length === 0) return { account: null, reason: 'no account', count: 0, short: 'no account on this computer can send' }
  return { account: null, reason: 'pick one', count: accounts.usable.length, short: 'several accounts can send and none is picked' }
}

/**
 * @param {string} dir
 * @returns {string | null}
 */
function thePickedAccount(dir) {
  const read = readJsonFromTheFolder(dir, 'account.json')
  const id = read !== null && typeof read === 'object' ? /** @type {{ id?: unknown }} */ (read).id : undefined
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * A TOKEN FOR ONE SEND, asked of GNOME Online Accounts, which renews it when it has to. Never written anywhere.
 * @param {string} busctl
 * @param {Account} account
 * @returns {Promise<string>}
 */
export async function aToken(busctl, account) {
  const answer = await callTheAccounts(busctl, [account.path, `${GOA}.OAuth2Based`, 'GetAccessToken'])
  const token = Array.isArray(answer?.data) ? answer.data[0] : undefined
  if (typeof token !== 'string' || token === '') throw new Error('GNOME Online Accounts gave no token')
  return token
}

// ============================================================================================ the mail server

/**
 * @typedef {{ host: string, port: number, security: 'tls' | 'starttls' | 'plain', says: string }} Server
 */

/** @param {string} host */
const onThisComputer = (host) => host === '127.0.0.1' || host === 'localhost' || host === '::1'

/**
 * WHERE THE LETTERS GO: the account's own mail server, over TLS from the first byte or STARTTLS, on the port it names or
 * the usual one; or a test's stand-in, named by `override`, which is taken only as smtp:// on this computer.
 * @param {Account} account
 * @param {string | undefined} override
 * @returns {Server}
 */
export function whereToSend(account, override) {
  if (override !== undefined && override !== '') {
    /** @type {URL} */
    let url
    try {
      url = new URL(override)
    } catch {
      throw new Error(`MAIL_TOOL_SMTP_SERVER is ${JSON.stringify(override)}, which is not a server like smtp://127.0.0.1:2525`)
    }
    const host = url.hostname.replace(/^\[(.*)\]$/, '$1')
    if (url.protocol === 'smtp:' && onThisComputer(host)) {
      return { host, port: url.port === '' ? 25 : Number(url.port), security: 'plain', says: `${url.host}, a stand-in on this computer` }
    }
    throw new Error(
      'MAIL_TOOL_SMTP_SERVER names a server that is not a stand-in on this computer over smtp://; the real letters go to ' +
        "the account's own server, over TLS, and nowhere else",
    )
  }
  const port = account.port ?? (account.security === 'tls' ? 465 : 587)
  return { host: account.host, port, security: account.security, says: `${account.host}:${String(port)} over ${account.security === 'tls' ? 'TLS' : 'STARTTLS'}` }
}

/** @typedef {{ code: number, text: string, lines: string[] }} Answer */

/**
 * WHY A CONVERSATION WAS STOPPED by one of its own limits: nothing passed for `seconds`, or it reached its ceiling.
 * @typedef {{ why: 'silence' | 'ceiling', seconds: number }} ACut
 */

/**
 * Which limit stopped a conversation, in words for the log, before the login as after it.
 * @param {ACut} cut
 */
const theCutInWords = (cut) => (cut.why === 'silence' ? `nothing passed for ${String(cut.seconds)} seconds` : `it reached its ceiling of ${String(cut.seconds)} seconds`)

/**
 * ONE CONVERSATION WITH A MAIL SERVER: a line reader over the socket, which moves to the TLS socket after STARTTLS and
 * drops anything read before it, so nothing sent in the clear is read as if it came over TLS. It stops the talk when
 * nothing has passed either way for `silenceMs`. Node's own socket timeout is that clock: a write still going out
 * counts as something passing, so a big letter on a slow connection is not stopped while it moves.
 */
class Talk {
  /**
   * @param {import('node:net').Socket} socket
   * @param {number} silenceMs
   */
  constructor(socket, silenceMs) {
    this.silenceMs = silenceMs
    /** @type {ACut | null} */
    this.cut = null
    this.onSilence = () => this.stop('silence', silenceMs, `nothing passed between this computer and the mail server for ${String(silenceMs / 1000)} seconds`)
    /** @type {string[]} */
    this.lines = []
    this.buffer = ''
    /** @type {Error | null} */
    this.broken = null
    /** @type {(() => void) | null} */
    this.waiting = null
    /** @param {Buffer | string} chunk */
    this.onData = (chunk) => {
      this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('latin1')
      let at = this.buffer.indexOf('\r\n')
      while (at >= 0) {
        this.lines.push(this.buffer.slice(0, at))
        this.buffer = this.buffer.slice(at + 2)
        at = this.buffer.indexOf('\r\n')
      }
      this.wake()
    }
    /** @param {Error} err */
    this.onError = (err) => this.end(err)
    this.onClose = () => this.end(new Error('the mail server closed the connection'))
    /** @type {import('node:net').Socket} */
    this.socket = socket
    this.hold(socket)
  }

  /** @param {import('node:net').Socket} socket */
  hold(socket) {
    this.socket = socket
    this.lines = []
    this.buffer = ''
    socket.on('data', this.onData)
    socket.on('error', this.onError)
    socket.on('close', this.onClose)
    socket.setTimeout(this.silenceMs)
    socket.on('timeout', this.onSilence)
  }

  /** Lets the socket go, to be wrapped in TLS. */
  letGo() {
    this.socket.off('data', this.onData)
    this.socket.off('error', this.onError)
    this.socket.off('close', this.onClose)
    this.socket.setTimeout(0)
    this.socket.off('timeout', this.onSilence)
    return this.socket
  }

  /**
   * Stops the talk by one of its own limits, saying which.
   * @param {ACut['why']} why
   * @param {number} ms
   * @param {string} words
   */
  stop(why, ms, words) {
    this.cut ??= { why, seconds: ms / 1000 }
    this.socket.destroy(new Error(words))
  }

  /** @param {Error} why */
  end(why) {
    this.broken ??= why
    this.wake()
  }

  wake() {
    const waiting = this.waiting
    this.waiting = null
    waiting?.()
  }

  /**
   * The next whole answer: lines of `NNN-text` until one of `NNN text`.
   * @returns {Promise<Answer>}
   */
  async answer() {
    /** @type {string[]} */
    const lines = []
    for (;;) {
      const line = this.lines.shift()
      if (line === undefined) {
        if (this.broken !== null) throw this.broken
        await new Promise((next) => {
          this.waiting = () => next(undefined)
        })
        continue
      }
      const shaped = /^(\d{3})([ -])(.*)$/.exec(line)
      if (shaped === null) throw new Error('the mail server said something that is not an answer')
      lines.push(shaped[3] ?? '')
      if (shaped[2] === ' ') return { code: Number(shaped[1]), text: lines.join(' ').slice(0, 300), lines }
    }
  }

  /** @param {string} line */
  async say(line) {
    this.socket.write(`${line}\r\n`)
    return this.answer()
  }

  /** @param {string} text */
  write(text) {
    this.socket.write(text)
  }

  close() {
    this.socket.destroy()
  }
}

/** An answer the conversation cannot go on from; `code` is the server's, when it gave one. */
class Stopped extends Error {
  /**
   * @param {string} message
   * @param {number | null} code
   * @param {'login' | 'refused' | 'broken'} kind
   */
  constructor(message, code, kind) {
    super(message)
    this.code = code
    this.kind = kind
  }
}

/**
 * @param {Answer} answer
 * @param {number[]} codes
 * @param {string} what
 */
function expectCode(answer, codes, what) {
  if (!codes.includes(answer.code)) throw new Stopped(`${what}: ${String(answer.code)} ${answer.text}`, answer.code, 'refused')
}

/**
 * The login XOAUTH2 carries: the user and the token, base64 as RFC 7628 and Google's note shape it.
 * @param {string} user
 * @param {string} token
 */
export function xoauth2(user, token) {
  return Buffer.from(`user=${user}\u0001auth=Bearer ${token}\u0001\u0001`, 'utf8').toString('base64')
}

/**
 * @typedef {{ to: string, outcome: 'sent' | 'refused' | 'later', says: string }} ALetterDone
 * @typedef {{ login: 'taken' | 'refused' | 'not reached', says: string, short: string, letters: ALetterDone[], cut: ACut | null }} TheSend
 * @typedef {{ name: string, content: Buffer }} AnAttachment
 * @typedef {{ to: string, subject: string, body: string, attachments?: AnAttachment[] }} ALetter
 */

/**
 * SEND LETTERS, ONE TO EACH ADDRESS, IN ONE CONVERSATION: log in with the token, then each letter in turn. A letter the
 * server took is `sent`; one it refused with a 5xx is `refused` for good; anything else, and every letter after a
 * conversation that broke, is `later`. `says` is the server's side in English, for their Settings page in developer mode,
 * and may name the server; `short` is for the log and names nothing; `cut` says which of its own limits stopped it.
 * `limits` are a test's own, shorter than the real ones.
 * @param {{ server: Server, user: string, token: string, from: string, letters: ALetter[], ca?: string | Buffer, limits?: { silenceMs?: number, ceilingMs?: number } }} input
 * @returns {Promise<TheSend>}
 */
export async function sendLetters(input) {
  /** @type {ALetterDone[]} */
  const letters = input.letters.map((one) => ({ to: one.to, outcome: 'later', says: 'not sent: the talk with the mail server broke off before it' }))
  const { server } = input
  const servername = isIP(server.host) === 0 ? server.host : undefined
  /** @type {import('node:net').Socket} */
  const socket =
    server.security === 'tls'
      ? connectTls({ host: server.host, port: server.port, servername, ...(input.ca === undefined ? {} : { ca: input.ca }) })
      : connectPlain({ host: server.host, port: server.port })
  const talk = new Talk(socket, input.limits?.silenceMs ?? THE_LONGEST_TALK_MS)
  const ceilingMs = input.limits?.ceilingMs ?? theWholeTalkCeilingMs(input.letters)
  const clock = setTimeout(() => talk.stop('ceiling', ceilingMs, `the talk went past its ceiling of ${String(ceilingMs / 1000)} seconds`), ceilingMs)
  let loggedIn = false
  try {
    expectCode(await talk.answer(), [220], 'the greeting')
    let hello = await talk.say('EHLO mole-office')
    expectCode(hello, [250], 'EHLO')
    if (server.security === 'starttls') {
      if (!hello.lines.some((line) => /^STARTTLS\b/i.test(line))) {
        throw new Stopped('the mail server offers no STARTTLS, so the token was not sent', null, 'refused')
      }
      expectCode(await talk.say('STARTTLS'), [220], 'STARTTLS')
      const plain = talk.letGo()
      const secure = await new Promise((done, failed) => {
        // THE HOST IS NAMED so the certificate is checked against it, and not against "localhost", which is what a
        // socket handed over alone is checked against.
        const wrapped = connectTls({ socket: plain, host: server.host, servername, ...(input.ca === undefined ? {} : { ca: input.ca }) }, () => done(wrapped))
        wrapped.once('error', failed)
      })
      talk.hold(/** @type {import('node:net').Socket} */ (secure))
      hello = await talk.say('EHLO mole-office')
      expectCode(hello, [250], 'EHLO after TLS')
    }
    let auth = await talk.say(`AUTH XOAUTH2 ${xoauth2(input.user, input.token)}`)
    // A REFUSED XOAUTH2 LOGIN is a 334 carrying what went wrong, answered with an empty line before the refusal itself.
    if (auth.code === 334) auth = await talk.say('')
    if (auth.code !== 235) throw new Stopped(`the login: ${String(auth.code)} ${auth.text}`, auth.code, 'login')
    loggedIn = true
    for (const [at, letter] of input.letters.entries()) {
      const text = theMessage({
        from: input.from,
        fromName: 'Mole Office',
        to: [letter.to],
        subject: letter.subject,
        body: letter.body,
        date: new Date(),
        messageId: randomBytes(12).toString('hex'),
        ...(letter.attachments === undefined ? {} : { attachments: letter.attachments }),
      })
      /** @param {Answer} answer */
      const notTaken = (answer) => ({
        to: letter.to,
        outcome: /** @type {'refused' | 'later'} */ (answer.code >= 500 ? 'refused' : 'later'),
        says: `${String(answer.code)} ${answer.text}`,
      })
      const from = await talk.say(`MAIL FROM:<${input.from}>`)
      const rcpt = from.code === 250 ? await talk.say(`RCPT TO:<${letter.to}>`) : from
      const data = rcpt.code === 250 || rcpt.code === 251 ? await talk.say('DATA') : rcpt
      if (data.code !== 354) {
        letters[at] = notTaken(data)
        await talk.say('RSET')
        continue
      }
      talk.write(text)
      const took = await talk.answer()
      letters[at] = took.code === 250 ? { to: letter.to, outcome: 'sent', says: `${String(took.code)} ${took.text}` } : notTaken(took)
    }
    await talk.say('QUIT').catch(() => undefined)
    const sent = letters.filter((one) => one.outcome === 'sent').length
    return {
      login: 'taken',
      says: `${server.says} took ${String(sent)} of ${String(letters.length)}`,
      short: `the mail server took ${String(sent)} of ${String(letters.length)}`,
      letters,
      cut: null,
    }
  } catch (err) {
    const stopped = err instanceof Stopped ? err : null
    const why = err instanceof Error ? err.message : String(err)
    const { cut } = talk
    if (!loggedIn) {
      const login = stopped?.kind === 'login' ? 'refused' : 'not reached'
      return {
        login,
        says: `${server.says}: ${withoutAddresses(why)}`,
        short:
          login === 'refused'
            ? `the mail server refused the login (${String(stopped?.code ?? '')})`
            : cut !== null
              ? `the talk with the mail server was stopped before the login: ${theCutInWords(cut)}`
              : `the mail server could not be reached or would not talk${stopped?.code == null ? '' : ` (${String(stopped.code)})`}`,
        letters,
        cut,
      }
    }
    const short = cut === null ? 'the talk with the mail server broke off' : `the talk with the mail server was stopped: ${theCutInWords(cut)}`
    return { login: 'taken', says: `${server.says}: the talk broke off (${withoutAddresses(why)})`, short, letters, cut }
  } finally {
    clearTimeout(clock)
    talk.close()
  }
}

// ============================================================================================ the tool

/**
 * @typedef {object} ToolState
 * @property {'none' | 'unknown' | 'works' | 'refused'} key
 * @property {string} keySays  what the office said when it refused the key, in its own English; '' otherwise
 * @property {string | null} refusedKey  the key the office refused, so the same key is not tried again
 * @property {string} office  what the office last said, when it did not answer as it should, in its own English
 * @property {string | null} roundAt
 * @property {{ id: string, title: string, at: string } | null} lastMailed
 * @property {ASend | null} lastSend  what the last send of a summons came to
 * @property {ATest | null} lastTest  what their last "send a test" on Settings came to
 * @property {string[]} events  the log's own lines, which name no address, account or server
 *
 * WHY A SEND DID NOT HAPPEN, as a code their Settings page words: no account can send; several can and none is picked;
 * the mail server refused the login; it could not be reached or would not talk; the account or its token could not
 * be had.
 * @typedef {'no account' | 'pick one' | 'login refused' | 'server not reached' | 'account or token'} WhyNotSent
 * @typedef {{ at: string, reason: WhyNotSent | null, says: string }} ASend
 * @typedef {{ at: string, outcome: 'sent' | 'not sent' | 'empty list', reason: WhyNotSent | null, letters: ALetterDone[], says: string }} ATest
 */

/**
 * @typedef {object} ToolOptions
 * @property {string} dir
 * @property {string} api
 * @property {string} [busctl]
 * @property {string} [smtpServer]  a test's stand-in, see whereToSend
 * @property {string | Buffer} [ca]  a test's own certificate authority
 * @property {(line: string) => void} [say]  where a line of the log goes; stdout by default
 */

/**
 * One supplied letter through the saved account and the existing secure SMTP path. Importing this module starts
 * nothing. Callers decide when to send and which recipients remain; this function never retries or writes settings.
 * When the mail server was not reached, `cut` says which of the talk's own limits stopped it, if one did.
 * @param {Pick<ToolOptions, 'dir' | 'busctl' | 'smtpServer' | 'ca'>} options
 * @param {{ subject: string, body: string, attachments?: AnAttachment[] }} letter
 * @param {string[]} to
 * @returns {Promise<TheSend | { reason: WhyNotSent, says: string, short: string, cut: ACut | null }>}
 */
export async function sendMailToTheList(options, letter, to) {
  const { dir, busctl = 'busctl', smtpServer, ca } = options
  try {
    const picked = thePickedAccount(dir)
    const sender = theSender(await theAccounts(busctl), picked)
    if (sender.account === null) {
      return { reason: sender.reason, says: sender.short, short: sender.short, cut: null }
    }
    const server = whereToSend(sender.account, smtpServer)
    const token = await aToken(busctl, sender.account)
    const sent = await sendLetters({
      server,
      user: sender.account.user,
      token,
      from: sender.account.address,
      letters: to.map((address) => ({ to: address, ...letter })),
      ...(ca === undefined ? {} : { ca }),
    })
    /** @type {WhyNotSent | null} */
    const reason = sent.login === 'taken' ? null : sent.login === 'refused' ? 'login refused' : 'server not reached'
    return reason === null ? sent : { reason, says: sent.says, short: sent.short, cut: sent.cut }
  } catch (err) {
    const why = withoutAddresses(err instanceof Error ? err.message : String(err))
    return { reason: 'account or token', says: why, short: 'the account or its token could not be had', cut: null }
  }
}

/**
 * THE TOOL, AS A THING A TEST CAN DRIVE: `round` does what one tick of the clock does.
 * @param {ToolOptions} options
 */
export function makeTheTool(options) {
  const { dir, api, busctl = 'busctl', smtpServer, ca } = options
  /** @type {ToolState} */
  const state = { key: 'unknown', keySays: '', refusedKey: null, office: '', roundAt: null, lastMailed: null, lastSend: null, lastTest: null, events: [] }
  /** The addresses already mailed for the summons being mailed, so a round that tries again sends only to the rest. */
  let progress = { id: /** @type {string | null} */ (null), done: /** @type {Set<string>} */ (new Set()) }

  /**
   * A LINE OF THE LOG, which names no address, account or server, and never a key, a token or a letter's body.
   * @param {string} line
   */
  function say(line) {
    const safe = withoutAddresses(line)
    state.events = [`${localStampOf(new Date())}  ${safe}`, ...state.events].slice(0, THE_EVENTS_KEPT)
    if (options.say !== undefined) options.say(safe)
    else process.stdout.write(`${localStampOf(new Date())}  ${safe}\n`)
  }

  function theKey() {
    const text = readFromTheFolder(dir, 'key')
    const key = text === null ? '' : text.trim()
    return key === '' ? null : key
  }

  /** @param {string} key @param {string} says */
  function keyRefused(key, says) {
    state.key = 'refused'
    state.keySays = says
    state.refusedKey = key
    say('The office no longer takes this tool\'s key, so it stopped reading the summonses until a new key is put in its folder.')
  }

  function keyWorks() {
    if (state.key !== 'works') say('The office takes this tool\'s key; it reads the summonses.')
    state.key = 'works'
    state.keySays = ''
    state.refusedKey = null
    if (state.office !== '') say('The office answers again.')
    state.office = ''
  }

  /** @param {string} says */
  function officeDidNotAnswer(says) {
    if (state.office === '') say('The office did not answer as it should; the tool asks again on the next round.')
    state.office = says
  }

  /** @param {string | null} place */
  function putThePlace(place) {
    writeIntoTheFolder(dir, 'place', `${place ?? ''}\n`)
  }

  /**
   * THE FIRST START, A PLACE THE OFFICE NO LONGER KNOWS, OR TURNED BACK ON AFTER THEIR PRESS TURNED IT OFF: read to the
   * newest summons and take the place after it, mailing nothing. Reports false when the office did not let it finish,
   * so nothing is written and it is tried again.
   * @param {string} key
   * @param {'first start' | 'place lost' | 'turned back on'} why
   */
  async function startAfterTheNewest(key, why) {
    /** @type {string | null} */
    let place = null
    let passed = 0
    for (let reads = 0; reads < 1000; reads += 1) {
      const read = await readTheSummonses({ api, key, after: place })
      if (read.kind === 'key refused') {
        keyRefused(key, read.says)
        return false
      }
      if (read.kind === 'unreachable' || read.kind === 'place lost') {
        officeDidNotAnswer(read.says)
        return false
      }
      keyWorks()
      if (read.kind === 'unreadable') {
        place = read.id
        passed += 1
        continue
      }
      const last = read.summonses[read.summonses.length - 1]
      if (last === undefined) break
      place = last.id
      passed += read.summonses.length
    }
    putThePlace(place)
    say(
      // NO COUNT WHEN IT COMES BACK: it reads from the first summons to find the newest, so the number it passed is every
      // summons there is, not the ones made while it was off.
      why === 'turned back on'
        ? 'Turned back on after it was turned off: it starts after the newest summons, so nothing made while it was off is mailed; the office keeps every summons.'
        : passed === 0
          ? 'Started from the first summons: none has been made yet.'
          : `Started after the newest summons: the ${String(passed)} made before this tool began are not mailed.`,
    )
    return true
  }

  /**
   * SEND ONE LETTER TO THE ADDRESSES STILL WAITING FOR IT. Answers whether the summons is finished: every address has
   * it, or was refused it for good.
   * @param {string} id
   * @param {{ subject: string, body: string }} letter
   * @param {string} what  the summons in the log's words
   */
  async function mailIt(id, letter, what) {
    const addresses = theAddresses(dir)
    if (addresses.length === 0) {
      say(`Not mailed, since the list of addresses is empty: ${what}.`)
      return true
    }
    if (progress.id !== id) progress = { id, done: new Set() }
    const waiting = addresses.filter((one) => !progress.done.has(one))
    const sent = await sendToTheList(letter, waiting)
    if (!('letters' in sent)) {
      say(`Not mailed yet, and tried again on the next round: ${what}: ${sent.short}.`)
      return false
    }
    for (const one of sent.letters) if (one.outcome !== 'later') progress.done.add(one.to)
    const count = (/** @type {ALetterDone['outcome']} */ outcome) => sent.letters.filter((one) => one.outcome === outcome).length
    const later = count('later')
    if (later > 0) {
      say(`Mailed ${what} to ${String(count('sent'))} of ${String(waiting.length)} addresses; the other ${String(later)} are tried again on the next round.`)
      return false
    }
    const refused = count('refused') > 0 ? `; the mail server refused ${String(count('refused'))} for good` : ''
    say(`Mailed ${what} to ${String(count('sent'))} address${count('sent') === 1 ? '' : 'es'}${refused}.`)
    progress = { id: null, done: new Set() }
    return true
  }

  /**
   * Keep the shared send's result for Settings and the summons service.
   * @param {{ subject: string, body: string }} letter
   * @param {string[]} to
   */
  async function sendToTheList(letter, to) {
    const at = localStampOf(new Date())
    const sent = await sendMailToTheList({ dir, busctl, smtpServer, ca }, letter, to)
    state.lastSend = { at, reason: 'reason' in sent ? sent.reason : null, says: sent.says }
    return sent
  }

  /** ONE TICK: read what is new and mail it, in order, stopping at the first that is not finished. */
  async function round() {
    state.roundAt = localStampOf(new Date())
    const key = theKey()
    if (key === null) {
      if (state.key !== 'none') say('Its folder holds no key yet, so it reads nothing: the press on the Settings page gives it one.')
      state.key = 'none'
      state.keySays = ''
      return
    }
    if (state.key === 'refused' && key === state.refusedKey) return
    const place = thePlace(dir)
    if (place === undefined || place === THE_PLACE_AFTER_THE_NEWEST) {
      await startAfterTheNewest(key, place === undefined ? 'first start' : 'turned back on')
      return
    }
    let after = place === '' ? null : place
    for (let reads = 0; reads < THE_MOST_READS_IN_A_ROUND; reads += 1) {
      const read = await readTheSummonses({ api, key, after })
      if (read.kind === 'key refused') {
        keyRefused(key, read.says)
        return
      }
      if (read.kind === 'unreachable') {
        officeDidNotAnswer(read.says)
        return
      }
      keyWorks()
      if (read.kind === 'place lost') {
        say('The office does not know the last summons this tool finished, so it starts again after the newest; any made in between are not mailed.')
        await startAfterTheNewest(key, 'place lost')
        return
      }
      if (read.kind === 'unreadable') {
        if (!(await mailIt(read.id, theUnreadableSummonsMail(read.id), `the summons ${read.id}, which the office cannot read`))) return
        after = read.id
        putThePlace(after)
        continue
      }
      if (read.summonses.length === 0) return
      for (const one of read.summonses) {
        if (!(await mailIt(one.id, theSummonsMail(one), `summons ${one.id} (${one.title})`))) return
        after = one.id
        putThePlace(after)
        state.lastMailed = { id: one.id, title: one.title, at: localStampOf(new Date()) }
      }
    }
  }

  /**
   * THEIR "SEND A TEST": the test letter to every address on the list, and what became of each, for their Settings page.
   * @returns {Promise<ATest>}
   */
  async function sendATest() {
    const at = localStampOf(new Date())
    const addresses = theAddresses(dir)
    if (addresses.length === 0) {
      state.lastTest = { at, outcome: 'empty list', reason: null, letters: [], says: '' }
      return state.lastTest
    }
    const sent = await sendToTheList(theTestMail(), addresses)
    if ('letters' in sent) {
      state.lastTest = { at, outcome: 'sent', reason: null, letters: sent.letters, says: sent.says }
      say(`A test letter was sent on the person's press: ${sent.short}.`)
    } else {
      state.lastTest = { at, outcome: 'not sent', reason: sent.reason, letters: [], says: sent.says }
      say(`A test letter on the person's press was not sent: ${sent.short}.`)
    }
    return state.lastTest
  }

  /** The accounts for their Settings page, or why they could not be read, in the reader's own English. */
  async function accountsForSettings() {
    try {
      const accounts = await theAccounts(busctl)
      const sender = theSender(accounts, thePickedAccount(dir))
      // WHERE IT SENDS THROUGH, in English, for developer mode: the server a real letter goes to, or a test's stand-in.
      let server = ''
      if (sender.account !== null) {
        try {
          server = whereToSend(sender.account, smtpServer).says
        } catch (err) {
          server = withoutAddresses(err instanceof Error ? err.message : String(err))
        }
      }
      return { accounts, sender, why: '', server }
    } catch (err) {
      return { accounts: null, sender: null, why: withoutAddresses(err instanceof Error ? err.message : String(err)), server: '' }
    }
  }

  /**
   * THEIR PICK AMONG SEVERAL ACCOUNTS, kept by the account's id; only an account that can send is taken.
   * @param {string} id
   */
  async function pickTheAccount(id) {
    const accounts = await theAccounts(busctl)
    if (!accounts.usable.some((one) => one.id === id)) return false
    writeIntoTheFolder(dir, 'account.json', `${JSON.stringify({ id })}\n`)
    return true
  }

  return { round, sendATest, accountsForSettings, pickTheAccount, state, dir }
}

// ============================================================================================ the doors

/** The header the secret rides in: never the address, which a browser keeps, and never a cookie. */
export const THE_SECRET_HEADER = 'x-mail-tool-secret'

/** The most a request body may be, in characters. */
const THE_LONGEST_BODY = 64 * 1024

/**
 * @param {string} given
 * @param {string} secret
 */
function theSecretMatches(given, secret) {
  const a = Buffer.from(given, 'utf8')
  const b = Buffer.from(secret, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * THE ORIGINS WHOSE PAGES MAY READ THE DOORS' ANSWERS: the office's own addresses (its API, and the web app's when Vite
 * serves it apart), each as 127.0.0.1 and as localhost, since a browser may open the page by either name. Nothing
 * else, and never "*".
 * @param {readonly (string | undefined)[]} addresses
 * @returns {string[]}
 */
export function theOfficesOrigins(addresses) {
  /** @type {Set<string>} */
  const origins = new Set()
  for (const address of addresses) {
    if (address === undefined || address === '') continue
    /** @type {URL} */
    let url
    try {
      url = new URL(address)
    } catch {
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    origins.add(url.origin)
    /** @type {[string, string][]} */
    const twins = [['127.0.0.1', 'localhost'], ['localhost', '127.0.0.1']]
    for (const [one, other] of twins) {
      if (url.hostname === one) {
        const twin = new URL(url.origin)
        twin.hostname = other
        origins.add(twin.origin)
      }
    }
  }
  return [...origins]
}

/**
 * THE PAGES THAT MAY READ THE DOORS, WORKED OUT AT THE START AND SAID (problem cmlTxSP_m1rR). The office's API serves its
 * web app, and in development Vite serves it apart on a port of its own. When the web app's address cannot be read,
 * only the API's pages may read, and the log says so where it happens: a page served by Vite then hears only that the
 * tool did not answer. The log names the ports, never an address.
 * @param {{ api: string, webApp: () => string, say: (line: string) => void }} input
 * @returns {string[]}
 */
export function theOriginsAtStart(input) {
  /** @type {string | undefined} */
  let web
  try {
    web = input.webApp()
  } catch (err) {
    input.say(
      `The office's web app address could not be read (${withoutAddresses(err instanceof Error ? err.message : String(err))}), ` +
        "so only pages the office's API serves may read these doors; a page served apart, as Vite serves it in development, is refused.",
    )
  }
  const origins = theOfficesOrigins([input.api, web])
  const ports = [...new Set(origins.map((one) => new URL(one).port || '80'))]
  input.say(
    origins.length === 0
      ? "No page may read these doors: the office's own address could not be read either."
      : `Pages the office serves on this computer's port${ports.length === 1 ? '' : 's'} ${ports.join(' and ')} may read these doors.`,
  )
  return origins
}

/**
 * THE TOOL AS THEIR SETTINGS PAGE READS IT: data and codes, and no sentence of the tool's own, since the page words it
 * in their language. `details` holds what the office, the account reader and the mail server said, in their own English,
 * for developer mode.
 * @param {ReturnType<typeof makeTheTool>} tool
 */
export async function theStateForSettings(tool) {
  const { state } = tool
  const { accounts, sender, why, server } = await tool.accountsForSettings()
  const test = state.lastTest
  return {
    reading: state.key,
    officeAnswers: state.office === '',
    roundAt: state.roundAt,
    lastMailed: state.lastMailed === null ? null : { title: state.lastMailed.title, at: state.lastMailed.at },
    accounts:
      accounts === null
        ? null
        : {
            usable: accounts.usable.map((one) => ({ id: one.id, address: one.address, provider: one.provider })),
            unusable: accounts.unusable.map((one) => ({ name: one.name, provider: one.provider, reason: one.reason })),
          },
    sender:
      sender === null
        ? null
        : sender.account === null
          ? { account: null, reason: sender.reason, count: sender.count }
          : { account: { id: sender.account.id, address: sender.account.address, provider: sender.account.provider }, reason: null, count: accounts?.usable.length ?? 0 },
    addresses: theAddresses(tool.dir),
    mostAddresses: THE_MOST_ADDRESSES,
    lastSend: state.lastSend === null ? null : { at: state.lastSend.at, reason: state.lastSend.reason },
    lastTest:
      test === null
        ? null
        : { at: test.at, outcome: test.outcome, reason: test.reason, letters: test.letters.map((one) => ({ to: one.to, outcome: one.outcome })) },
    details: {
      key: state.keySays,
      office: state.office,
      accounts: why,
      server,
      lastSend: state.lastSend?.says ?? '',
      lastTest: test === null ? '' : test.says,
      letters: test === null ? [] : test.letters.map((one) => ({ to: one.to, says: one.says })),
      events: state.events,
    },
  }
}

/**
 * THE DOORS, on 127.0.0.1 only, for the mail tool's entry on their Settings page:
 *
 *   GET  /state      the tool as theStateForSettings reads it
 *   POST /addresses  {"addresses": "<what they typed, one address a line>"}: saved, or refused whole with a code
 *   POST /account    {"id": "<an account's id>"}: picked, or not, since that account cannot send
 *   POST /test       the test letter to every address on the list
 *
 * A POST answers what it did, and the state after it. Every request is refused, in this order, when it names another
 * host than this computer, when it comes from a page of another origin than the office's own, and when it does not
 * carry the secret. The preflight of the office's own page is the one request that carries no secret, because a
 * browser sends none on it; it is answered with what may be asked, and nothing else.
 * @param {ReturnType<typeof makeTheTool>} tool
 * @param {{ secret: string, origins: readonly string[], port?: number }} options
 * @returns {Promise<{ port: number, close: () => Promise<void> }>}
 */
export function serveTheDoors(tool, options) {
  const { secret, origins } = options
  /** @type {number} */
  let port = 0
  const server = createServer((req, res) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null
    const itsOwn = origin !== null && origins.includes(origin)
    /** @type {Record<string, string>} */
    const headers = {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      vary: 'Origin',
      ...(itsOwn && origin !== null ? { 'access-control-allow-origin': origin } : {}),
    }
    /** @param {number} code @param {unknown} body */
    const answer = (code, body) => {
      res.writeHead(code, headers)
      res.end(JSON.stringify(body))
    }
    const host = String(req.headers.host ?? '')
    if (![`127.0.0.1:${String(port)}`, `localhost:${String(port)}`].includes(host)) {
      answer(403, { refused: 'host', says: 'These doors answer only as 127.0.0.1 on this computer.' })
      return
    }
    if (origin !== null && !itsOwn) {
      answer(403, { refused: 'origin', says: "Only the office's own page may ask these doors." })
      return
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...headers,
        'access-control-allow-methods': 'GET, POST',
        'access-control-allow-headers': `content-type, ${THE_SECRET_HEADER}`,
        'access-control-max-age': '600',
      })
      res.end()
      return
    }
    const given = req.headers[THE_SECRET_HEADER]
    if (typeof given !== 'string' || !theSecretMatches(given, secret)) {
      answer(403, { refused: 'secret', says: 'These doors open only with the secret the person\'s Settings page holds.' })
      return
    }
    const url = new URL(req.url ?? '/', `http://${host}`)
    /** @param {Record<string, unknown>} body */
    const handle = async (body) => {
      const door = `${req.method ?? ''} ${url.pathname}`
      if (door === 'GET /state') {
        answer(200, await theStateForSettings(tool))
        return
      }
      if (door === 'POST /addresses') {
        const done = saveTheAddresses(tool.dir, typeof body['addresses'] === 'string' ? body['addresses'] : '')
        answer(200, { done, state: await theStateForSettings(tool) })
        return
      }
      if (door === 'POST /account') {
        const picked = await tool.pickTheAccount(typeof body['id'] === 'string' ? body['id'] : '')
        answer(200, { done: { picked }, state: await theStateForSettings(tool) })
        return
      }
      if (door === 'POST /test') {
        await tool.sendATest()
        answer(200, { done: { tested: true }, state: await theStateForSettings(tool) })
        return
      }
      answer(404, { refused: 'no such door', says: 'There is no such door.' })
    }
    /** @param {unknown} err */
    const failed = (err) => answer(500, { refused: 'failed', says: withoutAddresses(err instanceof Error ? err.message : String(err)) })
    if (req.method !== 'POST') {
      handle({}).catch(failed)
      return
    }
    let text = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      text += chunk
      if (text.length > THE_LONGEST_BODY) req.destroy()
    })
    req.on('end', () => {
      /** @type {unknown} */
      let body = {}
      try {
        body = text === '' ? {} : JSON.parse(text)
      } catch {
        answer(400, { refused: 'body', says: 'The body is not JSON.' })
        return
      }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        answer(400, { refused: 'body', says: 'The body is not a JSON object.' })
        return
      }
      handle(/** @type {Record<string, unknown>} */ (body)).catch(failed)
    })
  })
  return new Promise((done, failed) => {
    server.once('error', failed)
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      const where = server.address()
      port = where !== null && typeof where === 'object' ? where.port : 0
      done({ port, close: () => new Promise((closed) => server.close(() => closed(undefined))) })
    })
  })
}

// ============================================================================================ running it

/**
 * Whether another mail tool holds this folder: two would mail each summons twice.
 * @param {string} dir
 */
function anotherIsRunning(dir) {
  const text = readFromTheFolder(dir, 'page.json')
  if (text === null) return false
  let pid = 0
  try {
    pid = Number(/** @type {{ pid?: unknown }} */ (JSON.parse(text)).pid)
  } catch {
    return false
  }
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false
  try {
    return readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8').includes('mail-the-summonses')
  } catch {
    return false
  }
}

async function main() {
  const { whereIsTheApi, whereIsTheWebApp } = await import('./where-is-the-api.mjs')
  const dir = theMailToolFolder()
  makeTheFolder(dir)
  if (anotherIsRunning(dir)) {
    process.stderr.write(`Another mail tool is already running with the folder ${dir}, so this one did not start: two would mail each summons twice.\n`)
    process.exit(1)
  }
  let secret = (readFromTheFolder(dir, 'page-secret') ?? '').trim()
  if (secret === '') {
    secret = randomBytes(24).toString('hex')
    writeIntoTheFolder(dir, 'page-secret', `${secret}\n`)
  }
  const busctl = process.env['MAIL_TOOL_BUSCTL']
  const api = whereIsTheApi()
  const tool = makeTheTool({ dir, api, ...(busctl === undefined || busctl === '' ? {} : { busctl }), smtpServer: process.env['MAIL_TOOL_SMTP_SERVER'] })
  const wanted = Number(process.env['MAIL_TOOL_PORT'] ?? '0')
  // THE PAGES THAT MAY READ ITS ANSWERS: the office's own, as its API serves the web app, and as Vite serves it apart;
  // which they are is said in the log at every start (problem cmlTxSP_m1rR).
  const origins = theOriginsAtStart({ api, webApp: () => whereIsTheWebApp(), say: (line) => process.stdout.write(`${localStampOf(new Date())}  ${line}\n`) })
  const page = await serveTheDoors(tool, { secret, origins, port: Number.isInteger(wanted) && wanted >= 0 && wanted < 65536 ? wanted : 0 })
  writeIntoTheFolder(dir, 'page.json', `${JSON.stringify({ port: page.port, pid: process.pid, since: localStampOf(new Date()) })}\n`)
  process.stdout.write(`${localStampOf(new Date())}  Started; its doors for the Settings page are on this computer's port ${String(page.port)}.\n`)
  /** @type {NodeJS.Timeout | undefined} */
  let timer
  let stopping = false
  const tick = async () => {
    try {
      await tool.round()
    } catch (err) {
      process.stdout.write(`${localStampOf(new Date())}  A round failed: ${withoutAddresses(err instanceof Error ? err.message : String(err))}\n`)
    }
    if (!stopping) timer = setTimeout(() => void tick(), EVERY_MS)
  }
  for (const signal of /** @type {const} */ (['SIGTERM', 'SIGINT'])) {
    process.on(signal, () => {
      stopping = true
      clearTimeout(timer)
      void page.close().then(() => process.exit(0))
    })
  }
  await tick()
}

if (process.argv[1] !== undefined && existsSync(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`The mail tool stopped: ${withoutAddresses(err instanceof Error ? err.message : String(err))}\n`)
    process.exit(1)
  })
}
