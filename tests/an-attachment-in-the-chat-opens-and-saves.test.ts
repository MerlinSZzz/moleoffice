// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ATTACHMENT IN THE CHAT OPENS AND SAVES, WHATEVER IT IS AND HOWEVER LARGE.
 *
 * The fault: an attachment sent in the chat showed only "refused" and no download button, for pictures, films and the rest.
 * The answer, for the owner: a picture up to the page's 25 MB limit is shown with Save beside it. A film plays streamed at any size,
 * with Save. Any other file, and a picture over the limit, shows its name and size with Open and Save, both streamed, and
 * neither fetches the file's body into the page. A file the office could not serve is refused to the sender with the
 * reason, and never reaches the person as "Refused".
 *
 * WHAT EACH CASE PROVES, AND THE ONE-LINE CHANGE THAT TURNS IT RED
 *
 *   1. An agent's message carrying a file outside every preview root is refused with the reason, and the person never
 *      sees it.
 *   2 and 3. At 1440 and at 390 the person sees the four files of the message that was sent. The picture is drawn and
 *      saved. The film plays and is saved. The picture over the limit and the large text file each show their name and
 *      size, open in a new tab streamed and whole, and save whole. The page asked for neither large file's bytes.
 *      MUTATION: in src/web/components/MessagePictures.tsx, `whereAFileOpens` returns the plain address, without
 *      `&open=1`. Red at both widths: Open asks without open=1, so no answer to an open comes and the wait for it times
 *      out.
 *   4. Pictures of the chat in the light look at 1440 and 390, each fitting its width: the whole
 *      chat, and then each of the four files moved into the middle of the chat and in view, one picture each.
 *      They are kept in the folder W13Y_ATTACHMENT_SHOTS names, when it is set.
 *
 * MADE-UP DATA ONLY. The picture, the large picture and the film are drawn and recorded in this test's own browser,
 * and every file is written into a temporary folder of this test in the checkout's .logs/. The one preview root is a
 * folder inside it, set for this file's server alone. The file outside every root is written into a temporary folder
 * of the system's, because the checkout is always a root of its own. The servers come from `liveApp`: a throwaway
 * database and two free ports. Nothing here touches the owner's office.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page, Request } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { MAX_PREVIEW_BYTES } from '../src/shared/preview-limit.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const WIDTHS = [1440, 390] as const
/** The four files of the message, in its order, as each one's own picture is named. */
const PARTS = ['picture', 'film', 'large-picture', 'large-file'] as const
const AGENT = 'attachment-sender'
const AS_THE_OWNER = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AS_THE_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT }

/** Over the page's limit by a megabyte, so the large files are over it at any rounding. */
const LARGE_BYTES = MAX_PREVIEW_BYTES + 1024 * 1024

const WORDS = {
  refused: 'Test: the installer, from outside every root',
  picture: 'Test: a made-up picture of the build screen',
  film: 'Test: a made-up recording of a moving square',
  largePicture: 'Test: a made-up picture over the page limit',
  largeFile: 'Test: a made-up build log over the page limit',
}

let OURS = ''
let OUTSIDE = ''
let INSIDE = ''
let rootsBefore: string | undefined
const files = { picture: '', film: '', largePicture: '', largeFile: '', outside: '' }
const sizes = { picture: 0, film: 0 }
let theAgentRow = ''
let app: LiveApp
let page: Page
/** The message whose four files the width cases open and save. */
let theMessageId = ''

/** Every request this page made to the file door: the path asked, how, whether as a save, an open or a description, and the record it named. */
const asked: { path: string; method: string; saved: boolean; opened: boolean; metadata: boolean; record: string | null }[] = []

beforeAll(async () => {
  mkdirSync(join(CHECKOUT, '.logs'), { recursive: true })
  OURS = mkdtempSync(join(CHECKOUT, '.logs', 'chat-attachment-test-'))
  INSIDE = join(OURS, 'inside')
  mkdirSync(INSIDE)
  // OUTSIDE THE CHECKOUT, which the door counts as a root whatever the variable says.
  OUTSIDE = mkdtempSync(join(tmpdir(), 'chat-attachment-outside-'))
  rootsBefore = process.env.MOLE_OFFICE_PREVIEW_ROOTS
  // THE ONE ROOT, for this file's server alone: the child is started with this process's environment.
  process.env.MOLE_OFFICE_PREVIEW_ROOTS = INSIDE

  app = await liveApp({ name: 'chat-attachments', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page

  // THE PICTURES AND THE FILM ARE MADE IN THIS BROWSER, so each is a real one and none is somebody's.
  const made = await page.evaluate(async () => {
    const draw = (width: number, height: number, words: string): string => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')!
      context.fillStyle = '#2f5d8a'
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#ffffff'
      context.font = '20px sans-serif'
      context.fillText(words, 16, 40)
      return canvas.toDataURL('image/png').split(',')[1]!
    }
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const context = canvas.getContext('2d')!
    const stream = canvas.captureStream(20)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.42001E' })
    const chunks: Blob[] = []
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => chunks.push(event.data)
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' }))
      recorder.onerror = () => reject(new Error('The made-up film could not be recorded'))
    })
    recorder.start()
    for (let frame = 0; frame < 16; frame++) {
      context.fillStyle = '#16304d'
      context.fillRect(0, 0, 320, 180)
      context.fillStyle = '#ffd166'
      context.fillRect(10 + frame * 16, 60, 50, 50)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    recorder.stop()
    const film = await done
    for (const track of stream.getTracks()) track.stop()
    return {
      picture: draw(480, 270, 'Made-up picture'),
      largePicture: draw(64, 64, 'Big'),
      film: Array.from(new Uint8Array(await film.arrayBuffer())),
    }
  })
  files.picture = join(INSIDE, 'build-screen.png')
  files.film = join(INSIDE, 'moving-square.mp4')
  files.largePicture = join(INSIDE, 'large-picture.png')
  files.largeFile = join(INSIDE, 'build-log.txt')
  files.outside = join(OUTSIDE, 'installer.dmg')
  writeFileSync(files.picture, Buffer.from(made.picture, 'base64'))
  writeFileSync(files.film, Buffer.from(made.film))
  // A REAL PICTURE OVER THE LIMIT: a PNG, then zeros after its end, which a decoder reads past. Sparse, so it takes no disk.
  writeFileSync(files.largePicture, Buffer.from(made.largePicture, 'base64'))
  truncateSync(files.largePicture, LARGE_BYTES)
  writeFileSync(files.largeFile, '')
  truncateSync(files.largeFile, LARGE_BYTES)
  writeFileSync(files.outside, 'Made-up bytes outside every root.')
  sizes.picture = statSync(files.picture).size
  sizes.film = statSync(files.film).size

  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify({ kind: 'agent', title: 'Attachment sender', data: { handle: AGENT, runtime: 'claude-code', state: 'active' } }) })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const roster = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const registered = ((await roster.json()) as { agents: { id: string; handle: string }[] }).agents.find((one) => one.handle === AGENT)
  if (registered === undefined) throw new Error(`the registry holds no agent with the handle ${AGENT}`)
  theAgentRow = `agent:${registered.id}`

  page.on('request', (request: Request) => {
    const url = new URL(request.url())
    if (url.pathname !== '/api/file') return
    asked.push({ path: url.searchParams.get('path') ?? '', method: request.method(), saved: url.searchParams.get('download') === '1', opened: url.searchParams.get('open') === '1', metadata: url.searchParams.get('metadata') === '1', record: url.searchParams.get('record') })
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (rootsBefore === undefined) delete process.env.MOLE_OFFICE_PREVIEW_ROOTS
  else process.env.MOLE_OFFICE_PREVIEW_ROOTS = rootsBefore
  if (OURS !== '') rmSync(OURS, { recursive: true, force: true })
  if (OUTSIDE !== '') rmSync(OUTSIDE, { recursive: true, force: true })
}, 60_000)

const aFile = (id: string, path: string, alt: string): Record<string, unknown> => ({ id, type: 'image', path, alt })

async function sendFromTheAgent(title: string, pictures: Record<string, unknown>[]): Promise<Response> {
  const answer = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_AGENT,
    body: JSON.stringify({ kind: 'message', title, data: { body: title, to: [{ kind: 'person', id: THE_PERSON }], pictures } }),
  })
  if (answer.status === 201) {
    const made = (await answer.clone().json()) as { record?: { id?: string } }
    if (typeof made.record?.id === 'string') theMessageId = made.record.id
  }
  return answer
}

/** Open the chat and the conversation with the agent, at the page's present size. */
async function openTheConversation(): Promise<void> {
  await page.goto(`${app.site}/#/`)
  await waitForThePage(page)
  await openTheChat(page)
  await page.waitForSelector('.px-chat', { timeout: 15_000 })
  const back = await page.$('.px-chat-back')
  if (back !== null) await back.click()
  await page.waitForSelector(`.px-chat-contact[data-contact="${theAgentRow}"]`, { timeout: 15_000 })
  await page.click(`.px-chat-contact[data-contact="${theAgentRow}"]`)
  await page.waitForSelector('.px-chat-said .px-chat-pics', { timeout: 15_000 })
}

/** The four files of the message, in the order it carries them. */
const theFile = (index: number) => page.locator('.px-chat-said .px-chat-pics > .px-chat-pic').nth(index)

/** Wait until the picture has decoded and the film has read its length, and both large files have their row. */
async function waitForEveryFile(): Promise<void> {
  await page.waitForFunction(() => {
    const parts = [...document.querySelectorAll('.px-chat-said .px-chat-pics > .px-chat-pic')]
    const img = parts[0]?.querySelector('img') as HTMLImageElement | null | undefined
    const video = parts[1]?.querySelector('video')
    return parts.length === 4 && (img?.naturalWidth ?? 0) > 0 && (video?.readyState ?? 0) >= 1 &&
      parts[2]?.querySelector('.px-chat-file') !== null && parts[3]?.querySelector('.px-chat-file') !== null
  }, undefined, { timeout: 30_000 })
}

/** Press a link that saves, and give back the size and the digest of what the browser saved. */
async function save(link: ReturnType<Page['locator']>): Promise<{ bytes: number; sha256: string }> {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), link.click()])
  const where = await download.path()
  const saved = { bytes: statSync(where).size, sha256: createHash('sha256').update(readFileSync(where)).digest('hex') }
  await download.delete()
  return saved
}

/** Press a link that opens a new tab, and give back what the door answered that tab, then close it. */
async function open(link: ReturnType<Page['locator']>, path: string): Promise<{ status: number; type: string; disposition: string; length: string; tab: Page }> {
  const answered = page.context().waitForEvent('response', { predicate: (response) => response.url().includes(encodeURIComponent(path)) && response.url().includes('open=1'), timeout: 30_000 })
  const [tab] = await Promise.all([page.context().waitForEvent('page', { timeout: 30_000 }), link.click()])
  const response = await answered
  const headers = response.headers()
  return { status: response.status(), type: headers['content-type'] ?? '', disposition: headers['content-disposition'] ?? '', length: headers['content-length'] ?? '', tab }
}

const digestOf = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('an attachment in the chat opens and saves', () => {
  it('refuses a file outside every root to the sender with the reason, and the person never sees it', async () => {
    const refused = await sendFromTheAgent('Test: the installer', [aFile('outside', files.outside, WORDS.refused)])
    const said = await refused.text()
    expect(refused.status, said).toBe(403)
    expect(said).toContain('outside every preview root')
    expect(said).toContain('Put the file inside a preview root')
    expect(said).toContain('Nothing was sent.')

    const sent = await sendFromTheAgent('Test: four files for you', [
      aFile('picture', files.picture, WORDS.picture),
      aFile('film', files.film, WORDS.film),
      aFile('large-picture', files.largePicture, WORDS.largePicture),
      aFile('large-file', files.largeFile, WORDS.largeFile),
    ])
    expect(sent.status, await sent.clone().text()).toBe(201)

    await openTheConversation()
    await waitForEveryFile()
    const chat = await page.locator('.px-chat').innerText()
    expect(chat, 'the refused message never reached the person').not.toContain(WORDS.refused)
    expect(await page.locator('.px-chat [data-preview="refused"]').count(), 'no file is drawn as refused').toBe(0)
  }, 240_000)

  for (const width of [1440, 390] as const) {
    it(`opens or saves each of the four files at ${String(width)}`, async () => {
      await page.setViewportSize({ width, height: 1000 })
      asked.length = 0
      await openTheConversation()
      await waitForEveryFile()

      // EVERY ASK THE CHAT MAKES NAMES THE MESSAGE THE PICTURES BELONG TO, rather than asking by path alone.
      expect(theMessageId).not.toBe('')
      expect(asked.length).toBeGreaterThan(0)
      for (const one of asked) expect(one.record, JSON.stringify(one)).toBe(theMessageId)

      // THE PICTURE IS DRAWN, AND SAVE GIVES ITS OWN BYTES.
      expect(await theFile(0).locator('img').evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(480)
      expect(await save(theFile(0).locator('a.sb-picture-save')), 'the saved picture').toEqual({ bytes: sizes.picture, sha256: digestOf(files.picture) })

      // THE FILM PLAYS FROM THE DOOR, AND SAVE GIVES ITS OWN BYTES.
      const film = theFile(1).locator('video')
      await film.evaluate(async (video) => {
        const player = video as HTMLVideoElement
        player.muted = true
        await player.play()
        await new Promise((resolve) => setTimeout(resolve, 300))
      })
      expect(await film.evaluate((video) => (video as HTMLVideoElement).currentTime), 'the film moved on').toBeGreaterThan(0)
      expect(await save(theFile(1).locator('a.sb-video-save')), 'the saved film').toEqual({ bytes: sizes.film, sha256: digestOf(files.film) })

      // THE PICTURE OVER THE LIMIT AND THE LARGE FILE: their name, their size, Open streamed and whole, and Save whole.
      for (const [index, path, type] of [[2, files.largePicture, 'image/png'], [3, files.largeFile, 'text/plain']] as const) {
        const row = theFile(index)
        expect(await row.locator('.sb-file-name').innerText()).toBe(path.slice(path.lastIndexOf('/') + 1))
        expect(await row.locator('.sb-file-size').innerText()).toBe(`${(LARGE_BYTES / 1e6).toFixed(1)} MB`)
        const opened = await open(row.locator('a.sb-file-open'), path)
        expect(opened.status, `${path} opened`).toBe(200)
        expect(opened.type).toContain(type)
        expect(opened.disposition).toMatch(/^inline/)
        expect(opened.length).toBe(String(LARGE_BYTES))
        if (index === 2) {
          // THE PICTURE OVER THE LIMIT IS SHOWN WHOLE IN ITS TAB, which is what Open is for.
          await opened.tab.waitForFunction(() => (document.images[0]?.naturalWidth ?? 0) > 0, undefined, { timeout: 30_000 })
          expect(await opened.tab.evaluate(() => document.images[0]?.naturalWidth)).toBe(64)
        }
        await opened.tab.close()
        expect((await save(row.locator('a.sb-file-save'))).bytes, `${path} saved`).toBe(LARGE_BYTES)
      }

      // AND EVERY OPEN AND SAVE THE PRESSES MADE NAMED THE MESSAGE TOO, not only the page's first reads.
      expect(asked.length).toBeGreaterThan(0)
      for (const one of asked) expect(one.record, JSON.stringify(one)).toBe(theMessageId)

      // THE PAGE ASKS FOR EACH FILE'S FACTS, BUT DOES NOT READ EITHER LARGE FILE'S BODY.
      for (const path of [files.largePicture, files.largeFile]) {
        const facts = asked.filter((one) => one.path === path && (one.method === 'HEAD' || one.metadata))
        expect(facts.length, `the page asked for the facts of ${path}`).toBeGreaterThan(0)
        const read = asked.filter((one) => one.path === path && one.method !== 'HEAD' && !one.metadata && !one.saved && !one.opened)
        expect(read, `the page fetched the body of ${path}`).toEqual([])
      }
      expect(await page.locator('.px-chat [data-preview="refused"]').count()).toBe(0)
    }, 240_000)
  }

  it('is photographed at 1440 and 390 in the light look, each fitting its width', async () => {
    const output = process.env.W13Y_ATTACHMENT_SHOTS
    if (output !== undefined && output !== '') mkdirSync(output, { recursive: true })
    try {
      for (const width of WIDTHS) {
        for (const theme of ['light'] as const) {
          await page.setViewportSize({ width, height: 1000 })
          await page.goto(`${app.site}/#/`)
          await page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
          // THE LOOK IS APPLIED AS THE DOCUMENT LOADS, so the page is loaded again after it is stored.
          await page.reload()
          await page.waitForFunction((look) => document.documentElement.getAttribute('data-theme') === look, theme, { timeout: 30_000 })
          await openTheConversation()
          await waitForEveryFile()
          await theFile(3).scrollIntoViewIfNeeded()
          const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth &&
            [...document.querySelectorAll('.px-chat-said .px-chat-pics > .px-chat-pic')].every((part) => {
              const box = part.getBoundingClientRect()
              return box.left >= 0 && box.right <= innerWidth
            }))
          expect(fits, `${theme} at ${String(width)} fits its width`).toBe(true)
          await page.screenshot({ ...(output === undefined || output === '' ? {} : { path: join(output, `chat-attachments-${String(width)}-${theme}.png`) }) })

          // EACH FILE IN VIEW, one picture each: in the whole chat above, only the last of them is.
          for (const [index, part] of PARTS.entries()) {
            const shown = await theFile(index).evaluate((element) => {
              element.scrollIntoView({ block: 'center' })
              let scroller = element.parentElement
              while (scroller !== null && !(['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement
              const view = scroller === null ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect()
              const box = element.getBoundingClientRect()
              // AS MUCH OF THE FILE AS THE CHAT HAS ROOM FOR is in view.
              return Math.min(box.bottom, view.bottom) - Math.max(box.top, view.top) >= Math.min(box.height, view.bottom - view.top) - 2
            })
            expect(shown, `${part} is in view, ${theme} at ${String(width)}`).toBe(true)
            await page.screenshot({ ...(output === undefined || output === '' ? {} : { path: join(output, `chat-attachments-${String(width)}-${theme}-${part}.png`) }) })
          }
        }
      }
    } finally {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.evaluate(() => localStorage.setItem('mole-office.preset.theme', 'light'))
    }
  }, 600_000)
})
