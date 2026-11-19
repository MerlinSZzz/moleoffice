// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT PLAYS ITS AUDIO AND ITS VIDEO IN THE PAGE.
 *
 * A report must be able to play voice samples of about twenty seconds, in Chinese and in English, inside a
 * report, and the studio will have sample films. So a report has an `audio` block and a `video`
 * block. Both play from the file door as a report's video already did on 24 September 2026: the
 * player is handed the door's own address, asks for the file a stretch at a time with Range, and a
 * link beside it saves the whole file.
 *
 * WHAT IS MEASURED, in a real browser, for each block once in English, and the Chinese words once:
 *
 *   - IT PLAYS. The element's time moves forward. The sound is muted first, because a browser may
 *     refuse to start sound that no person pressed for.
 *   - IT SEEKS. Setting the time makes the element reach that time. Every request the player made
 *     carried Range and was answered 206. And the door answers a stretch from the middle of the file
 *     with 206 and exactly those bytes, which is the request a player makes for a part it has not read.
 *   - THE WHOLE FILE IS OFFERED. The save link is there, with its words in the page's language, and
 *     fetching it returns the whole file, byte for byte, as an attachment.
 *
 * THE FILES ARE MADE HERE AND ARE REAL. The sound is a 20-second WAV tone written by this test, the
 * length and size of a voice sample. The film is three seconds of a moving square, recorded as WebM
 * by this browser. Both go in through the upload door, as an agent's would, into a folder of this
 * test's own, which it deletes.
 *
 * THE WORDS ARE THE PAGE'S LANGUAGE, the video's save link and the three labels over a file's facts
 * among them (problem Od74zEnc5kU9). Mutation proof, 30 September 2026, in SummaryBlocks.tsx: the save
 * link written as the English literal again, and the Chinese words case goes red on the video's link;
 * before the words moved, the same case was red on the labels.
 *
 * WAVE 13n ROUND F: each player is played, seeked and saved once, in English. The Chinese page is read once for its
 * save links and file facts, because playing does not change with the language.
 *
 * PICTURES: set REPORT_MEDIA_SHOTS to a folder, and the report is photographed there at 1440, 990,
 * 660 and 390 pixels wide, light and dark. Nothing is written anywhere when it is not set.
 */

import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const HEARD = 'A steady tone of 440 hertz for twenty seconds. It is test sound, not a voice.'
const SEEN = 'A yellow square moves from left to right for three seconds. It is test film.'

/** A 20-second WAV: 44,100 samples a second, two channels, 16 bits, a 440 hertz tone. */
function aTwentySecondTone(): Buffer {
  const rate = 44_100
  const seconds = 20
  const frames = rate * seconds
  const data = Buffer.alloc(frames * 4)
  for (let i = 0; i < frames; i++) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000)
    data.writeInt16LE(sample, i * 4)
    data.writeInt16LE(sample, i * 4 + 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(2, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

interface Stored {
  path: string
  name: string
  size: number
  hash: string
}

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

let app: LiveApp
let folder: string
let previousRoots: string | undefined
let report = ''
const bytesOf: Record<'audio' | 'video', Buffer> = { audio: Buffer.alloc(0), video: Buffer.alloc(0) }
const storedAs: Partial<Record<'audio' | 'video', Stored>> = {}
/** Every request the page made for a file's bytes, with its Range and its answer. */
const asked: { url: string; range: string | null; status: number | null }[] = []

async function store(name: string, bytes: Buffer): Promise<Stored> {
  const answer = await fetch(`${app.api}/api/report-files`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ bytes: bytes.toString('base64'), name }),
  })
  expect(answer.status, await answer.clone().text()).toBe(201)
  return ((await answer.json()) as { file: Stored }).file
}

beforeAll(async () => {
  // OUTSIDE THE CHECKOUT, because no office start writes its database into a git worktree (problem nd7jOk5LCU4s).
  // The files are stored beside this database, so its folder is made a preview root, and they can be served.
  folder = aTestDatabaseFolder('report-plays-media')
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${folder}`
  app = await liveApp({
    name: 'report-plays-media',
    opensAt: 'full',
    database: join(folder, 'panelx.db'),
    viewport: { width: 1440, height: 1000 },
  })

  const setting = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ mediaLoad: 'with-page' }),
  })
  expect(setting.status, await setting.clone().text()).toBe(200)

  bytesOf.audio = aTwentySecondTone()
  // This browser records the film, so it is one this browser can play.
  await app.page.goto(`${app.site}/`)
  const film = await app.page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const context = canvas.getContext('2d')!
    const stream = canvas.captureStream(20)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' })
    const chunks: Blob[] = []
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => chunks.push(event.data)
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
      recorder.onerror = () => reject(new Error('Could not record the test film'))
    })
    recorder.start()
    for (let frame = 0; frame < 60; frame++) {
      context.fillStyle = '#16304d'
      context.fillRect(0, 0, 320, 180)
      context.fillStyle = '#ffd166'
      context.fillRect(10 + frame * 4, 60, 50, 50)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    recorder.stop()
    const blob = await done
    for (const track of stream.getTracks()) track.stop()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  bytesOf.video = Buffer.from(film)

  storedAs.audio = await store('voice-sample-tone.wav', bytesOf.audio)
  storedAs.video = await store('sample-film.webm', bytesOf.video)

  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report that plays a sound and a film',
      summary: 'One voice sample and one sample film, both test files.',
      data: {
        for: 'The report media test',
        date: '2026-09-30',
        blocks: [
          { id: 'b-1', type: 'heading', text: 'The samples' },
          { id: 'b-2', type: 'text', text: 'Both files below were made by the test. Neither is a real recording.' },
          { id: 'b-voice', type: 'audio', ...storedAs.audio, alt: HEARD, caption: 'Test sound, twenty seconds.' },
          { id: 'b-film', type: 'video', ...storedAs.video, alt: SEEN, caption: 'Test film, three seconds.' },
        ],
      },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  report = ((await filed.json()) as { record: { id: string } }).record.id

  app.page.on('request', (request) => {
    if (request.url().includes('/api/file?path=')) {
      asked.push({ url: request.url(), range: request.headers()['range'] ?? null, status: null })
    }
  })
  app.page.on('response', (response) => {
    const one = asked.find((a) => a.url === response.url() && a.status === null)
    if (one !== undefined) one.status = response.status()
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (folder) rmSync(folder, { recursive: true, force: true })
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
}, 60_000)

async function open(query: string): Promise<void> {
  await app.page.goto('about:blank')
  asked.length = 0
  await app.page.goto(`${app.site}/${query}#${recordPath(report)}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
}

const SAVE_WORDS: Record<'en' | 'zh', Record<'audio' | 'video', string>> = {
  en: { audio: 'Save the whole audio file', video: 'Save the whole video' },
  // The video's save link is drawn by the shared player in SummaryBlocks.tsx, and its words come from the
  // word lists, as the audio's do (problem Od74zEnc5kU9, item 4: they were English on a Chinese page).
  zh: { audio: '保存完整的音频文件', video: '保存完整的视频' },
}

/** The three labels over a file's facts, in the page's language. They were English on a Chinese page. */
// A PERSON SEES A FILE'S NAME AND SIZE; its hash is drawn in developer mode only (wave 13s round 12).
const FACT_LABELS: Record<'en' | 'zh', string[]> = {
  en: ['Name', 'Size'],
  zh: ['名称', '大小'],
}

for (const language of ['en'] as const) {
  for (const kind of ['audio', 'video'] as const) {
    describe(`the ${kind} block, in English`, () => {
      it('plays, seeks, and offers the whole file', async () => {
        await open('')
        const figure = app.page.locator(`figure[data-media="${kind}"]`)
        const player = figure.locator(kind)
        await player.waitFor({ timeout: 30_000 })
        const stored = storedAs[kind]!

        // HANDED THE DOOR'S ADDRESS, NOT A COPY IN THE PAGE.
        const src = (await player.getAttribute('src')) ?? ''
        expect(src.startsWith('blob:'), src).toBe(false)
        expect(src).toContain(`/api/file?path=${encodeURIComponent(stored.path)}&record=${report}&workspace=default`)
        expect(await player.getAttribute('aria-label')).toBe(kind === 'audio' ? HEARD : SEEN)
        expect(await figure.locator('.sb-file-name').innerText()).toBe(stored.name)
        expect(await figure.locator('.sb-file-hash').count(), 'a person was shown the hash').toBe(0)
        expect(await figure.locator('.sb-file-facts dt').evaluateAll((labels) => labels.map((one) => one.textContent ?? ''))).toEqual(FACT_LABELS[language])

        // IT PLAYS: the time moves forward.
        await player.evaluate(async (element) => {
          const media = element as HTMLMediaElement
          media.muted = true
          await media.play()
        })
        await app.page.waitForFunction(
          (selector) => (document.querySelector(selector) as HTMLMediaElement).currentTime > 0.3,
          `figure[data-media="${kind}"] ${kind}`,
          { timeout: 30_000 },
        )

        // IT SEEKS: the element reaches the time it is sent to.
        const target = kind === 'audio' ? 15 : 2
        const reached = await player.evaluate(async (element, to) => {
          const media = element as HTMLMediaElement
          media.pause()
          const seeked = new Promise<void>((resolve) => media.addEventListener('seeked', () => resolve(), { once: true }))
          media.currentTime = to
          await seeked
          return { time: media.currentTime, error: media.error?.message ?? null, duration: media.duration }
        }, target)
        expect(reached.error).toBeNull()
        expect(Math.abs(reached.time - target), JSON.stringify(reached)).toBeLessThan(0.5)

        // Every request the player made for these bytes asked for a stretch and was answered one.
        const byThePlayer = asked.filter((one) => one.url === src)
        expect(byThePlayer.length, JSON.stringify(asked)).toBeGreaterThan(0)
        for (const one of byThePlayer) {
          expect(one.range, JSON.stringify(one)).not.toBeNull()
          expect(one.status, JSON.stringify(one)).toBe(206)
        }
        // And the door answers a stretch from the middle, as it does for a player reading a part it has
        // not read. Asked from here rather than from the page, because a page on another origin is not
        // shown the content-range header.
        const from = Math.floor(stored.size / 2)
        const middle = await fetch(new URL(src, app.site), {
          headers: { ...AS_THE_OWNER, range: `bytes=${String(from)}-${String(from + 99)}` },
        })
        expect(middle.status).toBe(206)
        expect(middle.headers.get('content-range')).toBe(`bytes ${String(from)}-${String(from + 99)}/${String(stored.size)}`)
        expect(Buffer.from(await middle.arrayBuffer())).toEqual(bytesOf[kind].subarray(from, from + 100))

        // THE WHOLE FILE IS OFFERED: the link is there in the page's language, the page can fetch it,
        // and what it saves is the whole file, byte for byte, as an attachment.
        const save = figure.locator('a.sb-video-save')
        expect(await save.innerText()).toBe(SAVE_WORDS[language][kind])
        expect(await save.getAttribute('download')).not.toBeNull()
        const saveAt = (await save.getAttribute('href')) ?? ''
        expect(saveAt).toContain(`&record=${report}&workspace=default&download=1`)
        const inThePage = await app.page.evaluate(async (address) => {
          const answer = await fetch(address, { credentials: 'include' })
          return { status: answer.status, bytes: Array.from(new Uint8Array(await answer.arrayBuffer())) }
        }, saveAt)
        expect(inThePage.status).toBe(200)
        expect(Buffer.from(inThePage.bytes).equals(bytesOf[kind])).toBe(true)
        const whole = await fetch(new URL(saveAt, app.site), { headers: AS_THE_OWNER })
        expect(whole.status).toBe(200)
        expect(whole.headers.get('content-disposition')?.startsWith('attachment;')).toBe(true)
        expect(Buffer.from(await whole.arrayBuffer()).equals(bytesOf[kind])).toBe(true)
      }, 120_000)
    })
  }
}


describe('the pictures', () => {
  it('draws both players inside the page at every width, and photographs them when asked', async () => {
    const output = process.env['REPORT_MEDIA_SHOTS']
    if (output !== undefined) mkdirSync(output, { recursive: true })
    for (const look of ['light', 'dark'] as const) {
      await app.page.emulateMedia({ colorScheme: look })
      await open('')
      await app.page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), look)
      for (const width of [1440, 990, 660, 390]) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.locator('figure[data-media="video"] video').waitFor({ timeout: 30_000 })
        await app.page.locator('figure[data-media="audio"] audio').waitFor({ timeout: 30_000 })
        const fits = await app.page.locator('figure[data-media]').evaluateAll((figures) =>
          figures.every((figure) =>
            [figure, ...figure.querySelectorAll('audio, video')].every((element) => {
              const box = element.getBoundingClientRect()
              return box.left >= 0 && box.right <= innerWidth && box.width > 0
            }),
          ) && document.documentElement.scrollWidth <= innerWidth,
        )
        expect(fits, `${look} at ${String(width)}`).toBe(true)
        if (output !== undefined) {
          // The film's first frame is drawn, so the picture does not catch the player still loading.
          await app.page.waitForFunction(() => (document.querySelector('figure[data-media="video"] video') as HTMLVideoElement).readyState >= 2)
          await app.page.screenshot({ path: join(output, `report-media-${look}-${String(width)}.png`), fullPage: true })
        }
      }
    }
    // AND ONE IN CHINESE, at 1440 in the light look (chapter 6): the audio block's own words in the page language.
    if (output !== undefined) {
      await app.page.emulateMedia({ colorScheme: 'light' })
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await open('?lang=zh')
      await app.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
      await app.page.locator('figure[data-media="audio"] audio').waitFor({ timeout: 30_000 })
      await app.page.waitForFunction(() => (document.querySelector('figure[data-media="video"] video') as HTMLVideoElement).readyState >= 2)
      await app.page.screenshot({ path: join(output, 'report-media-zh-light-1440.png'), fullPage: true })
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ colorScheme: null })
  }, 180_000)
})
