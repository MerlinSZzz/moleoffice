// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PUSH: THE OFFICE TELLS THE DEVICES THE PERSON ALLOWED WHEN A SECRETARY CALLS THEM IN. It follows two
 * decisions: a summons is the office's own message and a
 * push to every device where the person pressed "allow notifications" once. Nothing else needs setting
 * up: no password, no address, no account.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A PUSH TRAVELS, AND WHAT EACH PART SEES
 * ---------------------------------------------------------------------------------------
 *
 * A browser that allows notifications gives the page an address at its maker's push service (Google's for Chrome,
 * Mozilla's for Firefox, Apple's for Safari) and two keys. The office posts to that address; the push service wakes
 * the browser; the browser's service worker (public/push-worker.js) shows the notification. The body is encrypted for
 * the browser's keys (RFC 8291, aes128gcm), so the push service carries it without reading it, and the office signs
 * each post with its own key (VAPID, RFC 8292), so a push service takes posts for these devices from this office alone.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE SIGNING KEY AND THE DEVICES ARE KEPT
 * ---------------------------------------------------------------------------------------
 *
 * In the office's key file beside the database, under the names in THE_PUSH_ENTRIES, as the summons mail's settings
 * are. Never .env and never the database. The file is covered in every sandbox and carried
 * by no backup, so a device's address, which names that device at its push service, stays on this machine, because no
 * address, user name, server or account may leak. The key is made when the office first starts, and never
 * read back to anybody; only its public half is served. An entry the office cannot read is never written over: it
 * is reported, because the file is the owner's.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A NOTIFICATION CARRIES
 * ---------------------------------------------------------------------------------------
 *
 * Who calls, how urgent it is, and the title the summons door already checked (one line, no link, no address). A
 * click opens the office page the worker was served from, so no address rides in the body either.
 */
import { createCipheriv, createECDH, createHash, createHmac, createPrivateKey, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto'

import { THE_LONGEST_DEVICE_NAME, type PushDevice, type PushedToAll, type PushOutcome, type PushState } from '@shared/push.ts'
import { nowStamp } from '@shared/time.ts'
import { providerKeyFromTheOfficeFile } from '../../config/provider-keys.mjs'
import { setProviderSecret } from './keys.ts'
import { aProviderSecretIsSet } from './a-provider-secret-is-set.ts'
import { PanelError } from './panel-error.ts'
import { THE_PUSH_ENTRIES } from '@shared/push-entries.ts'

export { THE_PUSH_ENTRIES }

/**
 * WHO TO WRITE TO ABOUT THIS SENDER, as RFC 8292 asks every signed post to say. It goes to the push services, so it
 * is a neutral address and never the owner's, because no address, user name, server or account may leak.
 */
export const THE_CONTACT = 'mailto:mole-office@example.com'

/** How long a push service keeps a notification for a device that is off: a day, like a summons' own day. */
const A_DAY_IN_SECONDS = 24 * 60 * 60

/** How long one post to a push service may take. */
const THE_LONGEST_POST_MS = 15_000

/** The record size the body declares; one record holds any notification the office sends. */
const THE_RECORD_SIZE = 4096

/** One notification, as the service worker reads it. */
export interface PushNotice {
  title: string
  body: string
  urgency: 'now' | 'soon'
  /** Notifications with one tag replace each other on a device rather than piling up. */
  tag: string
}

/** One device as the key file keeps it. The address never leaves this file and this module. */
export interface StoredDevice {
  endpoint: string
  p256dh: string
  auth: string
  name: string
  addedAt: string
}

/** How a post reaches a push service. The default is fetch; a test hands in its own stand-in. */
export type PushSend = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: Buffer; signal: AbortSignal },
) => Promise<{ status: number }>

const byFetch: PushSend = async (url, init) => {
  // THE BODY AS ITS OWN BYTES, which is what fetch takes: a Buffer can be a window on a larger pool.
  const answered = await fetch(url, { ...init, body: new Uint8Array(init.body) })
  await answered.arrayBuffer().catch(() => undefined)
  return { status: answered.status }
}

// ============================================================================ the key file's two entries

function theEntry(name: string): string | null {
  const read = providerKeyFromTheOfficeFile(name)
  return typeof read.value === 'string' && read.value !== '' ? read.value : null
}

interface SigningKey {
  privateKey: KeyObject
  /** The public half, uncompressed (65 bytes), as a browser subscribes with it and a post names it. */
  publicRaw: Buffer
}

/**
 * WHETHER THE OFFICE HOLDS A SIGNING KEY, worked out here and nowhere else: the start acts on this answer and the read
 * reports it (invariant 9; the inspector's note on run 82UH3653bxX0, where the two asked in different ways). The key is
 * there when the key file this process has already read has an entry of its name, as `ensureKeysExist` asks it, and not
 * the disk again. An entry that is there and empty is there: the start leaves it, and the read says it cannot be read.
 */
function theSigningKeyIsThere(): boolean {
  return aProviderSecretIsSet(THE_PUSH_ENTRIES.signingKey)
}

/**
 * MAKE THE OFFICE'S SIGNING KEY IF THIS IS THE FIRST START, beside the office's other keys. A P-256 pair (RFC 8292
 * names ES256), kept as a JWK in the key file. Called once when the server is built, as `ensureKeysExist` is, so that
 * reading the key is never also writing it (the inspector's refusal of run qSg6vp_xMKzI: GET /api/office/push is a
 * read). Idempotent: a start with a key there changes nothing. It never prints the key.
 */
export function ensureThePushKeyExists(): void {
  // ASKED THROUGH THE KEY FILE THIS PROCESS HAS ALREADY READ, and not from the disk again. A second office built in one
  // process (a test that restarts its office) then finds the key it made and writes nothing; reading the disk instead
  // found nothing when a test's folder had gone and tried to write into it (problem iQPGCoY7Wpgu).
  if (theSigningKeyIsThere()) return
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = privateKey.export({ format: 'jwk' })
  setProviderSecret(THE_PUSH_ENTRIES.signingKey, JSON.stringify({ kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, y: jwk.y }))
}

/**
 * THE OFFICE'S SIGNING KEY, READ AND NEVER MADE HERE: the office makes it when it starts (ensureThePushKeyExists). An
 * entry that is missing, empty or not a key is reported and never replaced: replacing it would silently cut every
 * device off. Whether it is there is `theSigningKeyIsThere`'s answer, the one the start acted on.
 */
export function theSigningKey(): SigningKey {
  if (!theSigningKeyIsThere()) {
    throw new PanelError(
      `The office's push signing key, "${THE_PUSH_ENTRIES.signingKey}" in its key file, is not there. The office makes it ` +
        'when it starts, so the key file was changed since; start the office again to make a new one, and allow ' +
        'notifications again on each device.',
      500,
    )
  }
  try {
    // AN EMPTY ENTRY IS THERE AND CANNOT BE READ: `theEntry` answers null for it, and parsing nothing throws.
    return fromTheJwk(JSON.parse(theEntry(THE_PUSH_ENTRIES.signingKey) ?? '') as Record<string, unknown>)
  } catch {
    throw new PanelError(
      `The office's push signing key, "${THE_PUSH_ENTRIES.signingKey}" in its key file, is there and cannot be read, so ` +
        'no notification can be signed. It was not replaced, because a new key cuts off every device the person allowed. ' +
        'Remove that one entry from the key file, start the office again to make a new one, and allow notifications ' +
        'again on each device.',
      500,
    )
  }
}

function fromTheJwk(jwk: Record<string, unknown>): SigningKey {
  if (jwk['kty'] !== 'EC' || jwk['crv'] !== 'P-256' || typeof jwk['x'] !== 'string' || typeof jwk['y'] !== 'string') {
    throw new Error('not a P-256 key')
  }
  const privateKey = createPrivateKey({ key: jwk as never, format: 'jwk' })
  const publicRaw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk['x'], 'base64url'), Buffer.from(jwk['y'], 'base64url')])
  return { privateKey, publicRaw }
}

/** Every device the person allowed, as the key file keeps them, oldest first. Entries of any other shape are left out. */
export function theStoredDevices(): StoredDevice[] {
  const stored = theEntry(THE_PUSH_ENTRIES.devices)
  if (stored === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) throw new Error('not a list')
  } catch {
    throw new PanelError(
      `The list of devices that take notifications, "${THE_PUSH_ENTRIES.devices}" in the office's key file, cannot be ` +
        'read, so nobody was told. It was not replaced. Remove that one entry and allow notifications again on each device.',
      500,
    )
  }
  return (parsed as unknown[]).filter(
    (one): one is StoredDevice =>
      typeof one === 'object' &&
      one !== null &&
      ['endpoint', 'p256dh', 'auth', 'name', 'addedAt'].every((field) => typeof (one as Record<string, unknown>)[field] === 'string'),
  )
}

function writeTheDevices(devices: readonly StoredDevice[]): void {
  setProviderSecret(THE_PUSH_ENTRIES.devices, JSON.stringify(devices))
}

/** A device's id: the first 16 hexadecimal characters of the SHA-256 of its address. The page works out its own. */
export function aDeviceId(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 16)
}

function asThePageReadsIt(one: StoredDevice): PushDevice {
  return { id: aDeviceId(one.endpoint), name: one.name, addedAt: one.addedAt }
}

/** What the Settings page reads: the public key to subscribe with, and the devices, never their addresses. */
export function thePushState(): PushState {
  const publicKey = theSigningKey().publicRaw.toString('base64url')
  const devices = theStoredDevices().map(asThePageReadsIt)
  return {
    publicKey,
    devices,
    says:
      devices.length === 0
        ? 'No device takes notifications yet. On each device where you want to be called, press to allow them.'
        : `When a secretary calls you, ${devices.length === 1 ? 'one device is' : `${String(devices.length)} devices are`} told.`,
  }
}

/**
 * A DEVICE AS THE PAGE GIVES IT, checked: an https address at a push service, named by a host and never by a machine
 * address or this computer, and the two keys a browser makes, of the lengths RFC 8291 gives them. Answers the device to
 * keep, or throws the refusal. The address is checked because the office posts to it: a page must not be able to point
 * the office at a machine of the owner's own network.
 */
export function aDeviceThePageMayGive(input: { endpoint: string; p256dh: string; auth: string; name?: string | undefined }): StoredDevice {
  let url: URL
  try {
    url = new URL(input.endpoint)
  } catch {
    throw new PanelError('A device is given by the address its browser made at its push service, and this is not an address. Nothing was kept.', 400)
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const aMachineAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')
  if (url.protocol !== 'https:' || aMachineAddress || host === 'localhost' || !host.includes('.') || input.endpoint.length > 2048) {
    throw new PanelError(
      'A device is given by the https address its browser made at its push service, which names the service by its ' +
        'name. This one does not, and the office posts only to such an address. Nothing was kept.',
      400,
    )
  }
  const p256dh = Buffer.from(input.p256dh, 'base64url')
  const auth = Buffer.from(input.auth, 'base64url')
  if (p256dh.length !== 65 || p256dh[0] !== 4 || auth.length !== 16) {
    throw new PanelError(
      "A device's two keys are the ones its browser made: a 65-byte public key and a 16-byte secret, in base64url. " +
        'These are not. Nothing was kept.',
      400,
    )
  }
  const name = (input.name ?? '').trim()
  if (/[\r\n]/.test(name) || name.length > THE_LONGEST_DEVICE_NAME) {
    throw new PanelError(`A device's name is one line of at most ${String(THE_LONGEST_DEVICE_NAME)} characters. Nothing was kept.`, 400)
  }
  return { endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, name: name === '' ? 'A device' : name, addedAt: nowStamp() }
}

/** Keep a device, replacing the one with the same address, so allowing twice on one device keeps one. */
export function keepADevice(device: StoredDevice): PushDevice {
  writeTheDevices([...theStoredDevices().filter((one) => one.endpoint !== device.endpoint), device])
  return asThePageReadsIt(device)
}

/** Stop telling a device. Answers whether there was one to stop. */
export function forgetADevice(endpoint: string): boolean {
  const devices = theStoredDevices()
  const kept = devices.filter((one) => one.endpoint !== endpoint)
  if (kept.length === devices.length) return false
  writeTheDevices(kept)
  return true
}

// ============================================================================ the two RFCs

/**
 * THE BODY OF ONE PUSH, ENCRYPTED FOR ONE DEVICE: RFC 8291 with RFC 8188's aes128gcm, in one record. `fixed` is for a
 * test that checks the RFC's own worked example; every real push makes a new sender key and a new salt.
 */
export function encryptForADevice(
  plaintext: Buffer,
  device: { p256dh: string; auth: string },
  fixed?: { senderPrivateKey: Buffer; salt: Buffer },
): Buffer {
  if (plaintext.length + 1 + 16 > THE_RECORD_SIZE) {
    throw new PanelError('A notification is at most a few thousand characters, and this one is longer. Nothing was sent.', 400)
  }
  const uaPublic = Buffer.from(device.p256dh, 'base64url')
  const authSecret = Buffer.from(device.auth, 'base64url')
  const sender = createECDH('prime256v1')
  if (fixed === undefined) sender.generateKeys()
  else sender.setPrivateKey(fixed.senderPrivateKey)
  const asPublic = sender.getPublicKey()
  const ecdhSecret = sender.computeSecret(uaPublic)
  const salt = fixed?.salt ?? randomBytes(16)
  const hmac = (key: Buffer, data: Buffer): Buffer => createHmac('sha256', key).update(data).digest()

  // THE KEY DERIVATION, step by step as RFC 8291 section 3.4 writes it.
  const prkKey = hmac(authSecret, ecdhSecret)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'latin1'), uaPublic, asPublic])
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]))
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'latin1')).subarray(0, 16)
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'latin1')).subarray(0, 12)

  // ONE RECORD: the text, the delimiter 0x02 that marks the last record, and no padding.
  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const sealed = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(21)
  salt.copy(header, 0)
  header.writeUInt32BE(THE_RECORD_SIZE, 16)
  header.writeUInt8(asPublic.length, 20)
  return Buffer.concat([header, asPublic, sealed])
}

/** THE SIGNATURE ON ONE POST: RFC 8292's `vapid` scheme, a JWT for the push service's origin, good for twelve hours. */
export function aSignedPost(endpoint: string, key: SigningKey, nowMs = Date.now()): string {
  const part = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 60 * 60, sub: THE_CONTACT })}`
  const signature = sign('sha256', Buffer.from(unsigned), { key: key.privateKey, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${unsigned}.${signature.toString('base64url')}, k=${key.publicRaw.toString('base64url')}`
}

// ============================================================================ sending

/** What went wrong reaching a push service, as a code and never an address. */
function aCodeOf(err: unknown): string {
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause
  if (typeof cause?.code === 'string') return cause.code
  if (err instanceof Error && err.name === 'TimeoutError') return `no answer within ${String(THE_LONGEST_POST_MS / 1000)} seconds`
  return err instanceof Error ? err.name : 'an error'
}

/**
 * TELL ONE DEVICE. A device its push service no longer knows (404 or 410) is taken off the list, as RFC 8030 asks; any
 * other refusal leaves it, and the outcome says what the service answered, by its status and nothing it wrote.
 */
export async function tellOneDevice(device: StoredDevice, notice: PushNotice, send: PushSend = byFetch): Promise<PushOutcome> {
  const id = aDeviceId(device.endpoint)
  const body = encryptForADevice(Buffer.from(JSON.stringify(notice)), device)
  let status: number
  try {
    ;({ status } = await send(device.endpoint, {
      method: 'POST',
      headers: {
        TTL: String(A_DAY_IN_SECONDS),
        Urgency: notice.urgency === 'now' ? 'high' : 'normal',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Authorization: aSignedPost(device.endpoint, theSigningKey()),
      },
      body,
      signal: AbortSignal.timeout(THE_LONGEST_POST_MS),
    }))
  } catch (err) {
    return { device: id, outcome: 'unreachable', says: `${device.name}: its push service could not be reached (${aCodeOf(err)})` }
  }
  if (status >= 200 && status < 300) return { device: id, outcome: 'told', says: `${device.name}: told` }
  if (status === 404 || status === 410) {
    forgetADevice(device.endpoint)
    return {
      device: id,
      outcome: 'gone',
      says: `${device.name}: its push service answered ${String(status)}, so the device no longer takes notifications and was taken off the list`,
    }
  }
  return { device: id, outcome: 'refused', says: `${device.name}: its push service answered ${String(status)}` }
}

/** TELL EVERY DEVICE THE PERSON ALLOWED, at once, and say what came of it in one sentence naming no address. */
export async function tellEveryDevice(notice: PushNotice, send: PushSend = byFetch): Promise<PushedToAll> {
  const devices = theStoredDevices()
  if (devices.length === 0) {
    return { told: 0, outcomes: [], says: 'No device takes notifications yet.' }
  }
  const outcomes = await Promise.all(devices.map((one) => tellOneDevice(one, notice, send)))
  const told = outcomes.filter((one) => one.outcome === 'told').length
  const notTold = outcomes.filter((one) => one.outcome !== 'told').map((one) => one.says)
  return {
    told,
    outcomes,
    says:
      `Told on ${String(told)} of ${String(devices.length)} ${devices.length === 1 ? 'device' : 'devices'}.` +
      (notTold.length === 0 ? '' : ` ${notTold.join('; ')}.`),
  }
}
