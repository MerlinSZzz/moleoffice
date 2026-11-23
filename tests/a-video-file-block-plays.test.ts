// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { sizeSaid } from '../src/shared/fileblocks.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
let app: LiveApp
let folder: string
let report: string
let videoPath: string
let fileFacts: { name: string; path: string; size: number; hash: string; caption: string }[]
const requests: { path: string; method: string; range: string | undefined }[] = []

beforeAll(async () => {
  mkdirSync(resolve('.logs'), { recursive: true })
  folder = mkdtempSync(resolve('.logs/report-media-video-'))
  app = await liveApp({ name: 'video-file-block', opensAt: 'full', viewport: { width: 1440, height: 1000 } })

  // Chromium records a moving shape, so this test checks real H.264 playback without an
  // external encoder, somebody else's recording, or bytes that only pretend to be a video.
  const bytes = await app.page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 360
    const context = canvas.getContext('2d')!
    const stream = canvas.captureStream(20)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.42001E' })
    const chunks: Blob[] = []
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => chunks.push(event.data)
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' }))
      recorder.onerror = () => reject(new Error('Could not record the synthetic H.264 clip'))
    })
    recorder.start()
    for (let frame = 0; frame < 24; frame++) {
      context.fillStyle = '#16304d'
      context.fillRect(0, 0, 640, 360)
      context.fillStyle = '#ffffff'
      context.font = '24px sans-serif'
      context.fillText('Synthetic video: moving square', 30, 55)
      context.fillStyle = '#ffd166'
      context.fillRect(35 + frame * 16, 140, 65, 65)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    recorder.stop()
    const blob = await done
    for (const track of stream.getTracks()) track.stop()
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  videoPath = join(folder, 'synthetic.mp4')
  const video = Buffer.from(bytes)
  const pdf = Buffer.from('%PDF-1.4\nSynthetic file for a non-video rendering check.\n%%EOF\n')
  const source = Buffer.from('export const synthetic = true\n')
  const files = [
    { id: 'video', path: videoPath, name: 'synthetic-recording.txt', bytes: video,
      caption: 'Synthetic H.264 video. The moving square is test data.' },
    { id: 'pdf', path: join(folder, 'document.pdf'), name: 'not-a-video.mp4', bytes: pdf,
      caption: 'Synthetic non-video file. Its name does not decide its content type.' },
    { id: 'source', path: join(folder, 'source.ts'), name: 'source.ts', bytes: source,
      caption: 'Synthetic source file.' },
  ]
  fileFacts = files.map((file) => ({ name: file.name, path: file.path, size: file.bytes.length,
    hash: createHash('sha256').update(file.bytes).digest('hex').slice(0, 16), caption: file.caption }))
  for (const file of files) writeFileSync(file.path, file.bytes)
  const response = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers,
    body: JSON.stringify({ kind: 'report', title: 'Synthetic video file block',
      summary: 'A synthetic H.264 recording, a non-video file and a code file.',
      data: { for: 'The report media test', date: '2026-09-26', blocks: fileFacts.map((file, index) => ({
        ...file, id: files[index]!.id, type: 'file',
      })) },
    }),
  })
  expect(response.status, await response.clone().text()).toBe(201)
  report = ((await response.json()) as { record: { id: string } }).record.id
  app.page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/file') requests.push({
      path: url.searchParams.get('path') ?? '', method: request.method(), range: request.headers()['range'],
    })
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (folder) rmSync(folder, { recursive: true, force: true })
}, 60_000)

async function openWith(choice: string) {
  await app.page.goto('about:blank')
  const response = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers, body: JSON.stringify({ mediaLoad: choice }),
  })
  expect(response.status, await response.clone().text()).toBe(200)
  requests.length = 0
  await app.page.goto(`${app.site}/#${recordPath(report)}`)
  await waitForThePage(app.page, 60_000)
}

async function photographFiles(choice: string) {
  const output = process.env['REPORT_MEDIA_SHOTS']
  if (output === undefined) return
  mkdirSync(output, { recursive: true })
  for (const theme of ['light', 'dark']) {
    await app.page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme)
    for (const width of [1440, 990, 660, 390]) {
      await app.page.setViewportSize({ width, height: 1000 })
      const fits = await app.page.locator('.sb-file').evaluateAll((elements) => elements.every((element) => {
        const box = element.getBoundingClientRect()
        return box.left >= 0 && box.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth
      }))
      expect(fits, `${choice}, ${theme} at ${width}`).toBe(true)
      await app.page.screenshot({ path: join(output, `file-${choice}-${theme}-${width}.png`), fullPage: true })
    }
  }
}

it('plays a video by the door content type, keeps every file press, and draws a source file as an attached file', async () => {
  await openWith('with-page')
  const player = app.page.locator('.sb-file video')
  await player.waitFor({ timeout: 10_000 })
  expect(await player.count()).toBe(1)
  const properties = await player.evaluate((element) => {
    const video = element as HTMLVideoElement
    return { controls: video.controls, preload: video.preload, src: video.getAttribute('src') }
  })
  expect(properties.controls).toBe(true)
  expect(properties.preload).toBe('metadata')
  expect(properties.src).toContain(`/api/file?path=${encodeURIComponent(videoPath)}&record=${report}&workspace=default`)
  expect(properties.src).not.toMatch(/^blob:/)
  // THE VIDEO FIGURE, THE PDF AND THE SOURCE FILE EACH CARRY ONE OPEN PRESS; THE PDF ALSO CARRIES THE
  // SHOW PRESS. In the current drawing a PDF is drawn by FileShownHere, so its Open link goes to the
  // office's own page for the file, and one press shows it here.
  expect(await app.page.locator('.sb-file-open').count()).toBe(3)
  expect(await app.page.locator('.sb-file-show').count()).toBe(1)
  expect(await app.page.locator('.sb-file-name').allTextContents()).toEqual([
    'synthetic-recording.txt', 'not-a-video.mp4', 'source.ts',
  ])
  // THE SOURCE FILE IS DRAWN AS AN ATTACHED FILE, not as its text.
  expect(await app.page.locator('.sb-file pre').count()).toBe(0)
  expect(await app.page.locator('.sb-file-code').count()).toBe(0)
  expect(await app.page.locator('.sb-file .sb-video-save').getAttribute('href')).toContain(`&record=${report}&workspace=default&download=1`)
  expect(requests.filter((request) => request.path.endsWith('.pdf') && request.method === 'GET')).toEqual([])

  await player.evaluate(async (element) => { await (element as HTMLVideoElement).play() })
  await app.page.waitForFunction(() => (document.querySelector('.sb-file video') as HTMLVideoElement).currentTime > 0.2)
  const played = await player.evaluate((element) => {
    const video = element as HTMLVideoElement
    video.pause()
    return { width: video.videoWidth, error: video.error?.message ?? null }
  })
  expect(played).toEqual({ width: 640, error: null })
  expect(requests.some((request) => request.path === videoPath && request.range !== undefined)).toBe(true)

  await photographFiles('with-page')
}, 120_000)

it('requests nothing when media is never and draws every file with its stored facts and an open link', async () => {
  await openWith('never')
  await app.page.locator('.sb-file-open').last().waitFor({ timeout: 10_000 })
  expect(requests).toEqual([])
  expect(await app.page.locator('.sb-file video').count()).toBe(0)
  expect(await app.page.locator('.sb-file pre').count()).toBe(0)
  expect(await app.page.locator('.sb-file-open').count()).toBe(fileFacts.length)
  for (const [index, file] of fileFacts.entries()) {
    const block = app.page.locator('.sb-file').nth(index)
    expect(await block.locator('.sb-file-name').innerText()).toBe(file.name)
    expect(await block.locator('.sb-file-size').innerText()).toBe(sizeSaid(file.size))
    // THE HASH IS A DEVELOPER'S: a person sees the name and size (wave 13s round 12).
    expect(await block.locator('.sb-file-hash').count()).toBe(0)
    expect(await block.locator('figcaption').innerText()).toBe(file.caption)
    expect(await block.locator('.sb-file-open').innerText()).toBe('Open the file')
    expect(await block.locator('.sb-file-open').getAttribute('href')).toBe(`${app.api}/api/file?path=${encodeURIComponent(file.path)}&record=${report}&workspace=default`)
  }
  await photographFiles('never')
  expect(requests).toEqual([])
}, 120_000)

it('reads only headers for the video on-press and plays after the reader asks to load it', async () => {
  await openWith('on-press')
  const press = app.page.locator('.sb-file .sb-image-press')
  await press.waitFor({ timeout: 10_000 })
  expect(await app.page.locator('.sb-file video').count()).toBe(0)
  expect(requests.filter((request) => request.path === videoPath && request.method !== 'HEAD')).toEqual([])
  await press.click()
  await app.page.locator('.sb-file video').waitFor({ timeout: 10_000 })
}, 120_000)
