// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILE THE PERSON COULD NOT OPEN IS NOT SENT, AND ONE THAT IS SENT OPENS AND SAVES AT ANY SIZE.
 *
 * In the chat, a file an agent sent showed only "Refused", with no way to download it, and pictures and films may have had the same fault.
 * An agent sent the owner a 290 MB installer from outside the preview roots. The message was stored, and the chat could only
 * draw "Refused". The answer, for the owner: the root boundary stays, the send is refused with the reason and where to put the
 * file, and the file is never copied. Films play streamed at any size, and any other file opens and saves streamed.
 *
 * WHAT EACH CASE PROVES, AND THE ONE-LINE CHANGE THAT TURNS IT RED
 *
 *   1. A message carrying a file the door would not serve is refused, says why, says where to put the file and how
 *      large it may be, and stores nothing: outside every root, a link that leads out, not there, a path through a
 *      file, not an absolute path, a web address, a data address, a path relative to the page, on another machine, on
 *      this machine named by its name, a folder, and one good file beside one bad one. The three addresses a browser
 *      loads itself are refused too: the send cannot see that one would load, and nothing in Mole Office sends one.
 *      An older message that carries one is still drawn by the browser, as before. MUTATION: in createRecordWithReport (src/server/lib/records.ts), drop the
 *      `refuseAFileTheDoorWouldNotServe(data, MESSAGE_CENTRE)` line. Red.
 *   2. A message carrying a picture, a film, a file over the page's 25 MB limit and an HTML page is sent.
 *   3. The large file is described by a HEAD with download=1 and no bytes, opened with open=1 and saved with
 *      download=1, both streamed whole. A plain HEAD of it is refused 413, as its plain GET is, and download=1 with
 *      open=1 is refused 400. MUTATION: in src/server/api/files.ts, `const opened = query.open === '1'` made
 *      `const opened = false`. Red.
 *   4. The HTML page opened with open=1 still carries the sandbox and nosniff headers.
 *   5. An older message whose file has gone since can still have its words changed.
 *   6. A record that becomes a message cannot bring back a picture from outside every root.
 *   7. The door itself refuses a file whose only reference names this machine by its name, so the send refusing such
 *      an attachment agrees with it.
 *
 * MADE-UP DATA ONLY. The files are written into two temporary folders of this test, and the one preview root is the
 * first of them, set for this file alone and removed after it. The database is a fresh one from `freshDb`.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import type { Response as LightMyRequestResponse } from 'light-my-request'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { MAX_PREVIEW_BYTES } from '../src/shared/preview-limit.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WRITER = 'attachment-writer'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
const AS_THE_WRITER = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WRITER, 'x-mole-office-workspace': 'default' }
const TO_THE_PERSON = [{ kind: 'person', id: THE_PERSON }]

/** A one-pixel PNG, so the picture is a real one. */
const A_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
/** One byte over the page's limit and a page of disk more, so the large file is over it by any rounding. */
const LARGE_BYTES = MAX_PREVIEW_BYTES + 4096

let t: TestDb
let app: FastifyInstance
let inside = ''
let outside = ''
let rootsBefore: string | undefined

const inRoot = (name: string): string => join(inside, name)

beforeAll(async () => {
  inside = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-attachments-inside-')))
  outside = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-attachments-outside-')))
  writeFileSync(inRoot('picture.png'), A_PNG)
  writeFileSync(inRoot('film.mp4'), Buffer.from('Made-up bytes standing for a film. The door types a file by its name.'))
  writeFileSync(inRoot('page.html'), '<script>fetch("/api/records")</script>')
  // A FILE OVER THE LIMIT that takes no disk: truncate makes it sparse, and its bytes read as zeros.
  writeFileSync(inRoot('large.txt'), '')
  truncateSync(inRoot('large.txt'), LARGE_BYTES)
  writeFileSync(inRoot('goes-away.png'), A_PNG)
  writeFileSync(inRoot('named-here.png'), A_PNG)
  mkdirSync(inRoot('a-folder.png'))
  writeFileSync(join(outside, 'installer.dmg'), 'Made-up bytes outside every root.')
  writeFileSync(join(outside, 'secret.png'), A_PNG)
  symlinkSync(join(outside, 'secret.png'), inRoot('link-out.png'))

  rootsBefore = process.env.MOLE_OFFICE_PREVIEW_ROOTS
  process.env.MOLE_OFFICE_PREVIEW_ROOTS = inside
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: WRITER, name: WRITER, role: 'worker', workArea: ['work'] } })
  expect(started.statusCode, started.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (rootsBefore === undefined) delete process.env.MOLE_OFFICE_PREVIEW_ROOTS
  else process.env.MOLE_OFFICE_PREVIEW_ROOTS = rootsBefore
  for (const folder of [inside, outside]) if (folder !== '') rmSync(folder, { recursive: true, force: true })
})

const messagesNow = (): number => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n

/** One attached file, as a message carries it. */
const aFile = (path: string, alt: string, more: Record<string, unknown> = {}): Record<string, unknown> => ({ id: alt.replace(/\W+/g, '-'), type: 'image', path, alt, ...more })

async function send(pictures: Record<string, unknown>[]): Promise<{ status: number; error: string; id: string | null }> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_WRITER, payload: { kind: 'message', title: 'Test: files for you', data: { body: 'Test: files for you.', to: TO_THE_PERSON, pictures } } })
  const body = reply.json() as { error?: string; record?: { id: string } }
  return { status: reply.statusCode, error: body.error ?? reply.body, id: body.record?.id ?? null }
}

/**
 * The file door, asked as the chat asks it: by the person, in the project the message is kept in, named
 * alike in the header and the address. The door refuses the two disagreeing.
 */
async function door(method: 'GET' | 'HEAD', path: string, extra = ''): Promise<LightMyRequestResponse> {
  const inTheMessageCentre = { ...AS_THE_PERSON, 'x-mole-office-workspace': 'message-centre' }
  return app.inject({ method, url: `/api/file?path=${encodeURIComponent(path)}&workspace=message-centre${extra}`, headers: inTheMessageCentre })
}

describe('a file the person could not open is not sent', () => {
  const REFUSED: ReadonlyArray<readonly [string, () => Record<string, unknown>[], number, readonly string[]]> = [
    ['outside every root', () => [aFile(join(outside, 'installer.dmg'), 'Test: the installer')], 403, ['outside every preview root', 'Put the file inside a preview root', 'has no size limit']],
    ['a link that leads out', () => [aFile(inRoot('link-out.png'), 'Test: a link')], 403, ['is a link to', 'outside every preview root']],
    ['not there', () => [aFile(inRoot('never-made.png'), 'Test: nothing')], 404, ['is not there']],
    ['a path through a file', () => [aFile(inRoot('picture.png/inside.png'), 'Test: through a file')], 409, ['could not be resolved (ENOTDIR)']],
    ['not an absolute path', () => [aFile('docs/a.png', 'Test: relative')], 400, ['not a plain absolute path']],
    ['a web address', () => [aFile('https://example.org/made-up.png', 'Test: a web address')], 400, ['"https://example.org/made-up.png"', 'not a plain absolute path']],
    ['a data address', () => [aFile('data:text/plain,made-up', 'Test: a data address')], 400, ['"data:text/plain,made-up"', 'not a plain absolute path']],
    ['a path relative to the page', () => [aFile('./made-up.png', 'Test: relative to the page')], 400, ['"./made-up.png"', 'not a plain absolute path']],
    ['on another machine', () => [aFile(inRoot('picture.png'), 'Test: elsewhere', { machine: 'made-up-orin' })], 409, ['on the machine "made-up-orin"', "cannot read another machine's disk"]],
    ['on this machine named by its name', () => [aFile(inRoot('picture.png'), 'Test: here by name', { machine: hostname() })], 409, [`on the machine "${hostname()}"`, 'attach it with no machine']],
    ['a folder', () => [aFile(inRoot('a-folder.png'), 'Test: a folder')], 409, ['not a file']],
    ['one good file beside one bad one', () => [aFile(inRoot('picture.png'), 'Test: good'), aFile(join(outside, 'installer.dmg'), 'Test: bad')], 403, ['"Test: bad"', 'outside every preview root']],
  ]
  for (const [what, pictures, status, says] of REFUSED) {
    it(`refuses ${what}, says why, and stores nothing`, async () => {
      const before = messagesNow()
      const sent = await send(pictures())
      expect(sent.status, sent.error).toBe(status)
      for (const words of says) expect(sent.error).toContain(words)
      expect(sent.error, 'the sender is told where to put the file').toContain('Put the file inside a preview root')
      expect(sent.error, 'the sender is told how large it may be').toContain(`a picture up to ${MAX_PREVIEW_BYTES.toLocaleString('en-GB')} bytes is shown`)
      expect(sent.error, 'the sender is told nothing went').toContain('Nothing was sent.')
      expect(messagesNow(), 'no message is stored').toBe(before)
    })
  }

  it('names the one preview root in the refusal of a file outside it', async () => {
    const sent = await send([aFile(join(outside, 'installer.dmg'), 'Test: the installer')])
    expect(sent.error).toContain(inside)
  })
})

describe('a file that is sent opens and saves at any size', () => {
  let sentId = ''
  beforeAll(async () => {
    const before = messagesNow()
    const sent = await send([
      aFile(inRoot('picture.png'), 'Test: a picture'),
      aFile(inRoot('film.mp4'), 'Test: a film'),
      aFile(inRoot('large.txt'), 'Test: a large file'),
      aFile(inRoot('page.html'), 'Test: a page'),
    ])
    expect(sent.status, sent.error).toBe(201)
    expect(messagesNow()).toBe(before + 1)
    sentId = sent.id ?? ''
  })

  it('is stored with every file it carries', () => {
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(sentId) as { data: string }
    const carried = (JSON.parse(row.data) as { pictures: { path: string }[] }).pictures.map((one) => one.path)
    expect(carried).toEqual([inRoot('picture.png'), inRoot('film.mp4'), inRoot('large.txt'), inRoot('page.html')])
  })

  it('describes the large file by a HEAD asked as a save, with no bytes', async () => {
    const head = await door('HEAD', inRoot('large.txt'), '&download=1')
    expect(head.statusCode, head.body).toBe(200)
    expect(head.headers['content-length']).toBe(String(LARGE_BYTES))
    expect(String(head.headers['content-type'])).toContain('text/plain')
    expect(head.rawPayload.length, 'a HEAD sends no bytes').toBe(0)
    // A PLAIN HEAD IS REFUSED AS ITS GET IS, which is why the chat asks as a save.
    expect((await door('HEAD', inRoot('large.txt'))).statusCode).toBe(413)
  })

  it('opens the large file in the browser, inline and whole', async () => {
    const opened = await door('GET', inRoot('large.txt'), '&open=1')
    expect(opened.statusCode, opened.body.slice(0, 300)).toBe(200)
    expect(String(opened.headers['content-disposition'])).toMatch(/^inline/)
    expect(opened.headers['content-length']).toBe(String(LARGE_BYTES))
    expect(opened.rawPayload.length).toBe(LARGE_BYTES)
  })

  it('saves the large file whole, as an attachment', async () => {
    const saved = await door('GET', inRoot('large.txt'), '&download=1')
    expect(saved.statusCode).toBe(200)
    expect(String(saved.headers['content-disposition'])).toMatch(/^attachment/)
    expect(saved.rawPayload.length).toBe(LARGE_BYTES)
  })

  it('refuses a request that asks both to open and to save, and a second value of open', async () => {
    const both = await door('GET', inRoot('large.txt'), '&download=1&open=1')
    expect(both.statusCode).toBe(400)
    expect((both.json() as { error: string }).error).toContain('Ask for one.')
    expect((await door('GET', inRoot('large.txt'), '&open=2')).statusCode).toBe(400)
  })

  it('keeps the sandbox on an HTML page that is opened', async () => {
    const opened = await door('GET', inRoot('page.html'), '&open=1')
    expect(opened.statusCode).toBe(200)
    expect(String(opened.headers['content-security-policy'])).toContain('sandbox')
    expect(opened.headers['x-content-type-options']).toBe('nosniff')
  })

  it('serves the picture and the film to the page as before', async () => {
    const picture = await door('GET', inRoot('picture.png'))
    expect(picture.statusCode).toBe(200)
    expect(picture.rawPayload.equals(A_PNG)).toBe(true)
    const film = await door('HEAD', inRoot('film.mp4'), '&download=1')
    expect(film.statusCode).toBe(200)
    expect(String(film.headers['content-type'])).toContain('video/mp4')
  })
})

describe('a later write to a message', () => {
  it('changes the words of an older message whose file has gone since', async () => {
    const sent = await send([aFile(inRoot('goes-away.png'), 'Test: it will go')])
    expect(sent.status, sent.error).toBe(201)
    rmSync(inRoot('goes-away.png'))
    const edited = await app.inject({ method: 'PATCH', url: `/api/records/${sent.id ?? ''}`, headers: AS_THE_WRITER, payload: { title: 'Test: files for you, corrected' } })
    expect(edited.statusCode, edited.body).toBe(200)
  })

  it('refuses a record that becomes a message bringing back a picture from outside every root', async () => {
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'note', title: 'Test: a note to become a message', data: { body: 'Test: words.', extra: { to: TO_THE_PERSON, pictures: [aFile(join(outside, 'installer.dmg'), 'Test: kept aside')] } } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const id = (filed.json() as { record: { id: string } }).record.id
    const before = messagesNow()
    const changed = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: AS_THE_PERSON, payload: { kind: 'message' } })
    expect(changed.statusCode, changed.body).toBe(403)
    expect((changed.json() as { error: string }).error).toContain('outside every preview root')
    expect(messagesNow(), 'it is still not a message').toBe(before)
  })
})

describe('the door and the send read a machine name alike', () => {
  it('refuses at the door a file whose only reference names this machine by its name', async () => {
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'note', title: 'Test: a note naming this machine', data: { body: 'Test: words.', extra: { files: [{ path: inRoot('named-here.png'), machine: hostname() }] } } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const asked = await app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(inRoot('named-here.png'))}&workspace=default`, headers: AS_THE_PERSON })
    expect(asked.statusCode, asked.body).toBe(409)
    expect((asked.json() as { error: string }).error).toContain(`file is on ${hostname()}`)
  })
})
