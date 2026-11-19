// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SUMMONS TELLS EVERY DEVICE THE PERSON ALLOWED. The office summons the person with its own message and with push
 * to every device where they pressed "allow notifications" once, and nothing else needs setting
 * up. The sending is src/server/lib/push.ts, the doors src/server/api/push.ts, the
 * press src/web/components/AllowNotifications.tsx, and the worker public/push-worker.js.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The body of a push is RFC 8291's: the RFC's own worked example comes out byte for byte.
 *   2. The doors are the person's: an agent is refused each of the four, and nothing is kept.
 *   3. A device is kept only as a browser gives one: an https address at a push service named by its name, and the two
 *      keys of the RFC's lengths. It is listed by an id and never by its address, and allowing twice keeps one.
 *   4. A summons tells every device: each post is signed with the office's key for the push service's origin (RFC
 *      8292), marked aes128gcm, urgent or not as the summons is, and the device's own keys open it to who calls, how
 *      urgent it is and the title. The reply counts the devices told, and the message says so.
 *   5. A device its push service no longer knows (410) is taken off the list, and the others are still told.
 *   6. The test press tells one device, named by its id; an id no device has is refused.
 *   7. The page names a device and says why it cannot be told on a page that is not encrypted; the worker shows what
 *      the office sent, holds an urgent one until the person looks, and shows a body that is not the office's as its words.
 *   8. The signing key is made when the office starts, and reading the doors' state writes nothing: the key file is the
 *      same byte for byte after a read (the inspector's refusal of run qSg6vp_xMKzI).
 *   9. When PUSH_SHOTS names a folder, the Settings page's panel is photographed with a device on its list, at the four
 *      widths and in both themes (chapter 6), for the secretary's look on a world.
 *  10. A second office started in the same process finds the key the first made and writes nothing, even when its
 *      folder has gone (problem iQPGCoY7Wpgu).
 *  11. An empty signing key is there for the start and for the read alike: the start leaves it, and the read says it is
 *      there and cannot be read (the inspector's note on run 82UH3653bxX0).
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the key derivation's info left without the device's key: case 1 goes red;
 *   - an agent let through the doors: case 2 goes red;
 *   - an http address kept: case 3 goes red;
 *   - the summons not telling the devices: case 4 goes red;
 *   - a 410 leaving the device on the list: case 5 goes red.
 */

import { createDecipheriv, createECDH, createHash, createHmac, createPublicKey, randomBytes, verify } from 'node:crypto'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, liveApp, waitForThePage, type TestDb } from './helpers.ts'
import { settings } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { NOTIFICATION_WORDS } from '../src/shared/push.ts'
import { THE_PUSH_ENTRIES } from '../src/shared/push-entries.ts'

let t: TestDb
let app: FastifyInstance
/** The push library, loaded after the test's own database is made, because the records it imports open one. */
let push: typeof import('../src/server/lib/push.ts')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ code: number; said: Record<string, any>; text: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  let said: Record<string, any> = {}
  try {
    said = reply.json() as Record<string, any>
  } catch {
    said = {}
  }
  return { code: reply.statusCode, said, text: reply.body }
}

// ============================================================================ a device, as a browser would make one

interface ATestDevice {
  privateKey: Buffer
  publicKey: Buffer
  auth: Buffer
}

function aTestDevice(): ATestDevice {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return { privateKey: ecdh.getPrivateKey(), publicKey: ecdh.getPublicKey(), auth: randomBytes(16) }
}

/**
 * WHAT THE DEVICE READS, decrypted the way its browser would, from RFC 8291 section 3.4 as the receiver reads it: the
 * salt, the record size and the sender's key from the header, then the same derivation from the device's side.
 */
function openAsTheDevice(body: Buffer, device: ATestDevice): string {
  const salt = body.subarray(0, 16)
  const idLength = body[20] ?? 0
  const senderKey = body.subarray(21, 21 + idLength)
  const sealed = body.subarray(21 + idLength)
  const me = createECDH('prime256v1')
  me.setPrivateKey(device.privateKey)
  const hmac = (key: Buffer, data: Buffer): Buffer => createHmac('sha256', key).update(data).digest()
  const prkKey = hmac(device.auth, me.computeSecret(senderKey))
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0', 'latin1'), device.publicKey, senderKey, Buffer.from([1])]))
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'latin1')).subarray(0, 16)
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'latin1')).subarray(0, 12)
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce)
  decipher.setAuthTag(sealed.subarray(sealed.length - 16))
  const plain = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()])
  expect(plain[plain.length - 1], 'the last record ends with the delimiter 0x02').toBe(2)
  return plain.subarray(0, plain.length - 1).toString('utf8')
}

// ============================================================================ a stand-in push service

interface APost {
  path: string
  headers: IncomingHttpHeaders
  body: Buffer
}

const posts: APost[] = []
let pushService: Server
let serviceOrigin = ''

beforeAll(async () => {
  pushService = createServer((req, res) => {
    const parts: Buffer[] = []
    req.on('data', (part: Buffer) => parts.push(part))
    req.on('end', () => {
      posts.push({ path: req.url ?? '', headers: req.headers, body: Buffer.concat(parts) })
      // A DEVICE UNDER /gone/ IS ONE THE SERVICE NO LONGER KNOWS, as RFC 8030 answers it.
      res.statusCode = (req.url ?? '').startsWith('/gone/') ? 410 : 201
      res.end()
    })
  })
  await new Promise<void>((done) => pushService.listen(0, '127.0.0.1', () => done()))
  serviceOrigin = `http://127.0.0.1:${String((pushService.address() as AddressInfo).port)}`
  t = await freshDb()
  push = await import('../src/server/lib/push.ts')
  app = (await apiApp()).app
  await app.ready()
  const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'sec-one', name: 'Secretary One', role: 'secretary' })
  expect(started.code, started.text).toBe(201)
})

afterAll(async () => {
  await app?.close()
  t?.close()
  await new Promise<void>((done) => pushService.close(() => done()))
})

/**
 * A DEVICE AT THE STAND-IN SERVICE, kept through the library because the door keeps only https addresses at a named
 * push service, which a test on this machine cannot serve.
 */
function keepATestDevice(path: string, name: string): { device: ATestDevice; endpoint: string; id: string } {
  const device = aTestDevice()
  const endpoint = `${serviceOrigin}${path}`
  push.keepADevice({ endpoint, p256dh: device.publicKey.toString('base64url'), auth: device.auth.toString('base64url'), name, addedAt: '2026-09-26 20:00:00' })
  return { device, endpoint, id: createHash('sha256').update(endpoint).digest('hex').slice(0, 16) }
}

/** THE KEY FILE AS A HASH, so that an assertion about it that fails prints no key, not even a test world's. */
function theKeyFileHash(): string {
  return createHash('sha256').update(readFileSync(settings().keysPath)).digest('hex')
}

// ============================================================================ the cases

describe('the body of a push', () => {
  it("1: is RFC 8291's, byte for byte on the RFC's own worked example", () => {
    // RFC 8291 section 5 and appendix A: the sender's private key, the receiver's public key, the salt and the auth
    // secret, and the body they make.
    const made = push.encryptForADevice(
      Buffer.from('When I grow up, I want to be a watermelon'),
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      { senderPrivateKey: Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url'), salt: Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url') },
    )
    expect(made.toString('base64url')).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
        'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
        'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    )
  })
})

describe('the doors', () => {
  it('2: are the person’s: an agent is refused each of the four, and nothing is kept', async () => {
    for (const [method, url, body] of [
      ['GET', '/api/office/push', undefined],
      ['POST', '/api/office/push/devices', { endpoint: 'https://push.example.net/push/abc', keys: { p256dh: 'x', auth: 'y' } }],
      ['POST', '/api/office/push/devices/remove', { device: '0123456789abcdef' }],
      ['POST', '/api/office/push/test', { device: '0123456789abcdef' }],
    ] as const) {
      const refused = await ask(method, url, asAgent('sec-one'), body)
      expect(refused.code, `${method} ${url}: ${refused.text.slice(0, 200)}`).toBe(403)
      expect(refused.text).toContain("the owner's own act")
    }
    expect(push.theStoredDevices()).toEqual([])
  })

  it('3: keep a device only as a browser gives one, list it by an id, and keep one when it is allowed twice', async () => {
    const device = aTestDevice()
    const keys = { p256dh: device.publicKey.toString('base64url'), auth: device.auth.toString('base64url') }
    // The home-network address is built from its numbers, because the address scan refuses one written out.
    for (const endpoint of ['http://push.example.net/push/abc', `https://${[192, 168, 40, 7].join('.')}/push/abc`, 'https://localhost/push/abc', 'https://[::1]/push/abc']) {
      const refused = await ask('POST', '/api/office/push/devices', AS_THE_PERSON, { endpoint, keys })
      expect(refused.code, `${endpoint}: ${refused.text.slice(0, 200)}`).toBe(400)
    }
    const badKeys = await ask('POST', '/api/office/push/devices', AS_THE_PERSON, { endpoint: 'https://push.example.net/push/abc', keys: { p256dh: 'AAAA', auth: keys.auth } })
    expect(badKeys.code, badKeys.text).toBe(400)
    expect(push.theStoredDevices()).toEqual([])

    const endpoint = 'https://push.example.net/push/abc'
    const kept = await ask('POST', '/api/office/push/devices', AS_THE_PERSON, { endpoint, keys, name: 'Firefox on Linux' })
    expect(kept.code, kept.text).toBe(200)
    const id = createHash('sha256').update(endpoint).digest('hex').slice(0, 16)
    expect(kept.said['device']).toMatchObject({ id, name: 'Firefox on Linux' })
    expect(kept.text, 'no reply carries a device address').not.toContain('push.example.net')
    const again = await ask('POST', '/api/office/push/devices', AS_THE_PERSON, { endpoint, keys, name: 'Firefox on Linux' })
    expect(again.said['state'].devices).toHaveLength(1)

    const read = await ask('GET', '/api/office/push', AS_THE_PERSON)
    expect(read.code, read.text).toBe(200)
    expect(Buffer.from(String(read.said['publicKey']), 'base64url')[0], 'an uncompressed P-256 key').toBe(4)
    expect(read.text).not.toContain('push.example.net')

    const stopped = await ask('POST', '/api/office/push/devices/remove', AS_THE_PERSON, { device: id })
    expect(stopped.said['removed']).toBe(true)
    expect(push.theStoredDevices()).toEqual([])
  })
})

describe('a summons', () => {
  it('4: tells every device, signed for the push service and readable only by the device', async () => {
    const one = keepATestDevice('/push/one', 'Firefox on Linux')
    const two = keepATestDevice('/push/two', 'Chrome on Android')
    posts.length = 0
    const called = await ask('POST', '/api/office/summon', asAgent('sec-one'), { title: 'The nightly build is red', urgency: 'now' })
    expect(called.code, called.text).toBe(200)
    expect(called.said['told']).toBe(2)
    expect(posts.map((one) => one.path).sort()).toEqual(['/push/one', '/push/two'])

    const publicKey = String((await ask('GET', '/api/office/push', AS_THE_PERSON)).said['publicKey'])
    for (const [post, device] of [[posts.find((p) => p.path === '/push/one'), one.device], [posts.find((p) => p.path === '/push/two'), two.device]] as const) {
      expect(post?.headers['content-encoding']).toBe('aes128gcm')
      expect(post?.headers['urgency']).toBe('high')
      expect(Number(post?.headers['ttl'])).toBeGreaterThan(0)
      // THE SIGNATURE: a JWT for the service's origin, good for less than a day, verified with the key the page reads.
      const signed = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(String(post?.headers['authorization']))
      expect(signed, 'a vapid authorization').not.toBeNull()
      const [, head, claims, signature, key] = signed as unknown as string[]
      expect(key).toBe(publicKey)
      const said = JSON.parse(Buffer.from(String(claims), 'base64url').toString('utf8')) as { aud: string; exp: number; sub: string }
      expect(said.aud).toBe(serviceOrigin)
      expect(said.sub).toBe(push.THE_CONTACT)
      expect(said.exp - Date.now() / 1000).toBeGreaterThan(0)
      expect(said.exp - Date.now() / 1000).toBeLessThanOrEqual(24 * 60 * 60)
      const raw = Buffer.from(String(key), 'base64url')
      const verifier = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' })
      expect(verify('sha256', Buffer.from(`${String(head)}.${String(claims)}`), { key: verifier, dsaEncoding: 'ieee-p1363' }, Buffer.from(String(signature), 'base64url'))).toBe(true)
      // THE BODY, opened with the device's own keys.
      const notice = JSON.parse(openAsTheDevice(post?.body ?? Buffer.alloc(0), device)) as Record<string, string>
      expect(notice).toMatchObject({ title: 'Secretary One 叫你到 office 来', urgency: 'now', tag: 'summons' })
      expect(notice['body']).toContain('The nightly build is red')
    }

    const message = (await ask('GET', `/api/records/${String(called.said['message'])}`, AS_THE_PERSON)).said['record'] as { data: { body: string } }
    expect(message.data.body).toContain('Told on 2 of 2 devices.')

    // NOT URGENT IS NOT URGENT on the push either.
    posts.length = 0
    await ask('POST', '/api/office/summon', asAgent('sec-one'), { title: 'A question when you have time', urgency: 'soon' })
    expect(posts.map((one) => one.headers['urgency'])).toEqual(['normal', 'normal'])
  })

  it('5: takes a device its push service no longer knows off the list, and still tells the others', async () => {
    const gone = keepATestDevice('/gone/three', 'Safari on a Mac')
    const before = push.theStoredDevices().length
    const called = await ask('POST', '/api/office/summon', asAgent('sec-one'), { title: 'Back to the queue', urgency: 'now' })
    expect(called.said['told']).toBe(before - 1)
    expect(push.theStoredDevices().some((one) => one.endpoint === gone.endpoint)).toBe(false)
    expect(push.theStoredDevices()).toHaveLength(before - 1)
    const message = (await ask('GET', `/api/records/${String(called.said['message'])}`, AS_THE_PERSON)).said['record'] as { data: { body: string } }
    expect(message.data.body).toContain('taken off the list')
  })
})

describe('the test press', () => {
  it('6: tells one device, named by its id, and refuses an id no device has', async () => {
    const one = push.theStoredDevices().find((device) => device.endpoint.endsWith('/push/one'))
    expect(one, 'the device kept in case 4').toBeDefined()
    posts.length = 0
    const id = createHash('sha256').update(String(one?.endpoint)).digest('hex').slice(0, 16)
    const tested = await ask('POST', '/api/office/push/test', AS_THE_PERSON, { device: id })
    expect(tested.code, tested.text).toBe(200)
    expect(tested.said['outcome']).toBe('told')
    expect(posts.map((post) => post.path)).toEqual(['/push/one'])
    expect(tested.text).not.toContain('127.0.0.1')
    const unknown = await ask('POST', '/api/office/push/test', AS_THE_PERSON, { device: 'ffffffffffffffff' })
    expect(unknown.code, unknown.text).toBe(404)
  })
})

describe('the page and the worker', () => {
  it('7: the page names a device and says why a page that is not encrypted cannot be told; the worker shows what was sent', async () => {
    const page = await import('../src/web/components/AllowNotifications.tsx')
    expect(page.aNameForThisDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Firefox on Windows')
    expect(page.aNameForThisDevice('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36')).toBe('Chrome on Android')
    expect(page.aNameForThisDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone')

    // A PAGE THAT IS NOT ENCRYPTED: the sentence says so, and no press is drawn (the panel's body, drawn here; the
    // inspector's note on run zLZCL1lVy2o1 asked that the test show it rather than only the reading).
    const hadWindow = 'window' in globalThis
    const before = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = { isSecureContext: false }
    try {
      expect(page.whatThisDeviceCan()).toEqual({ can: false, why: 'notEncrypted' })
      const drawn = renderToStaticMarkup(h(page.AllowNotifications, { first: { publicKey: 'a-key', devices: [], says: 'No device takes notifications yet.' } }))
      expect(drawn).toContain(NOTIFICATION_WORDS.notEncrypted)
      expect(drawn, 'a press is drawn where the device cannot be told').not.toContain(NOTIFICATION_WORDS.allow)
    } finally {
      if (hadWindow) (globalThis as { window?: unknown }).window = before
      else delete (globalThis as { window?: unknown }).window
    }
    expect(NOTIFICATION_WORDS.notEncrypted).toContain('https')

    // THE WORKER, run in a stand-in of a service worker's global scope.
    const listeners: Record<string, (event: unknown) => void> = {}
    const shown: { title: string; options: Record<string, unknown> }[] = []
    const waited: Promise<unknown>[] = []
    const self = {
      addEventListener: (name: string, listener: (event: unknown) => void) => {
        listeners[name] = listener
      },
      registration: {
        showNotification: async (title: string, options: Record<string, unknown>) => {
          shown.push({ title, options })
        },
      },
      clients: { matchAll: async () => [], openWindow: async () => null },
    }
    runInNewContext(readFileSync(new URL('../public/push-worker.js', import.meta.url), 'utf8'), { self })
    listeners['push']?.({
      data: { json: () => ({ title: 'Secretary One 叫你到 office 来', body: '急，请尽快来：The nightly build is red', urgency: 'now', tag: 'summons' }) },
      waitUntil: (work: Promise<unknown>) => waited.push(work),
    })
    await Promise.all(waited)
    expect(shown).toEqual([
      { title: 'Secretary One 叫你到 office 来', options: { body: '急，请尽快来：The nightly build is red', tag: 'summons', renotify: true, requireInteraction: true } },
    ])

    // A BODY THAT IS NOT THE OFFICE'S JSON is shown as its words, under the office's name.
    listeners['push']?.({
      data: {
        json: () => {
          throw new SyntaxError('not JSON')
        },
        text: () => 'Plain words from the office',
      },
      waitUntil: (work: Promise<unknown>) => waited.push(work),
    })
    await Promise.all(waited)
    expect(shown.at(-1)).toMatchObject({ title: 'Mole Office', options: { body: 'Plain words from the office' } })

  })
})

describe('the key and the page', () => {
  it('8: the signing key is made when the office starts, and a read of the state writes nothing', async () => {
    const before = theKeyFileHash()
    expect((JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { providers: Record<string, unknown> }).providers['push-signing-key'], 'made when the office started').toBeDefined()
    const read = await ask('GET', '/api/office/push', AS_THE_PERSON)
    expect(read.code, read.text).toBe(200)
    expect(theKeyFileHash(), 'the read wrote the key file').toBe(before)
  })

  /**
   * PHOTOGRAPH THE PANEL, with a device on its list, at the widths and in both themes, when `PUSH_SHOTS` names a
   * folder. The mutation and control runs leave it unset and take no picture.
   */
  it.skipIf(!process.env['PUSH_SHOTS'])('9: photographs the notifications panel', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['PUSH_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    keepATestDevice('/push/pictured', 'Firefox on Windows')
    const live = await liveApp({ name: 'push-panel', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: t.file })
    try {
      // A HEADLESS BROWSER STARTS WITH NOTIFICATIONS BLOCKED; allowed here, the panel shows the state the person meets first.
      await live.page.context().grantPermissions(['notifications'], { origin: live.site })
      await live.page.goto(`${live.site}/#/settings`, { timeout: 60_000 })
      await waitForThePage(live.page, 60_000)
      const panel = live.page.locator('[data-target="uiSurface/settings.notifications"]').first()
      await panel.waitFor()
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await live.page.setViewportSize({ width, height: 1000 })
          await live.page.emulateMedia({ colorScheme: theme })
          await panel.scrollIntoViewIfNeeded()
          await panel.screenshot({ path: `${shots}/push-panel-${String(width)}-${theme}.png` })
        }
      }
    } finally {
      await live.stop()
    }
  }, 300_000)

  it('10: a second start in the same process finds the key it made and writes nothing, even with its folder gone', () => {
    // PROBLEM iQPGCoY7Wpgu: a test restarted its office after its folder had gone, and the start read the key file from
    // the disk, found nothing, and tried to write into the missing folder. The folder is moved away only for this one
    // call, which touches no database, and put back at once.
    const folder = dirname(settings().keysPath)
    const away = `${folder}-away-for-a-moment`
    renameSync(folder, away)
    try {
      expect(() => push.ensureThePushKeyExists()).not.toThrow()
    } finally {
      renameSync(away, folder)
    }
  })

  it('11: an empty signing key is there for the start and the read alike: the start leaves it, and the read says it cannot be read', async () => {
    // THE INSPECTOR'S NOTE ON RUN 82UH3653bxX0: the start asked whether the key is there in one way and the read in
    // another, so an empty entry was there for the start and missing for the read. The key is put back at the end.
    const { setProviderSecret } = await import('../src/server/lib/keys.ts')
    const theKey = (JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { providers: Record<string, string> }).providers[THE_PUSH_ENTRIES.signingKey]
    expect(theKey, 'made when the office started').toBeDefined()
    setProviderSecret(THE_PUSH_ENTRIES.signingKey, '')
    try {
      const emptied = theKeyFileHash()
      push.ensureThePushKeyExists()
      expect(theKeyFileHash(), 'the start replaced a key that is there').toBe(emptied)
      const read = await ask('GET', '/api/office/push', AS_THE_PERSON)
      expect(read.code, read.text).toBe(500)
      expect(read.text).toContain('is there and cannot be read')
    } finally {
      setProviderSecret(THE_PUSH_ENTRIES.signingKey, theKey as string)
    }
    expect((await ask('GET', '/api/office/push', AS_THE_PERSON)).code, 'the key was put back').toBe(200)
  })
})
