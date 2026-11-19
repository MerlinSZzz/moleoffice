// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PATH BLOCK WHOSE KIND IS VIDEO PLAYS ITS VIDEO IN THE PAGE. Problem Od74zEnc5kU9.
 *
 * Reports carry demo videos as `path` blocks of kind `video`, and such a block drew only its label,
 * its kind and its path, with no player. It now plays on the player a `video` block uses
 * (`Player` in src/web/components/ReportMedia.tsx), from the file door, a stretch at a time.
 *
 * WHAT IS MEASURED, in a real browser, in English and at ?lang=zh:
 *
 *   - A PATH BLOCK OF KIND VIDEO ON THIS MACHINE, INSIDE A PREVIEW ROOT, DRAWS A PLAYER. The player is
 *     handed the door's own address with the project, it asks the door with Range and is answered 206,
 *     and it plays: its time moves forward. The save link is there in the page's language.
 *   - THE PATH LINE STAYS. The label, the kind and the path are drawn as they were.
 *   - A PATH BLOCK THE DOOR WILL NOT SERVE SAYS SO AND DRAWS NO PLAYER. One names another machine and
 *     one is outside every preview root; each draws the door's refusal and its path, and no player.
 *   - A PATH BLOCK OF ANOTHER KIND DRAWS NO PLAYER, as before.
 *
 * THE FILM IS MADE HERE AND IS REAL: three seconds of a moving square, recorded as WebM by this
 * browser, written into a folder of this test's own inside the checkout (a preview root), which it
 * deletes. The other two paths are made up and never written.
 *
 * MUTATION PROOF, 30 September 2026, in SummaryBlocks.tsx: the path case no longer draws `PathVideo`,
 * so a path block of kind video draws only its path again, and the player cases go red. And in
 * `usePictureBytes`: a refused HEAD no longer asks a GET for the door's sentence, so a refused player
 * says "the server did not say why", and the refusal cases go red on the machine's name.
 *
 * PICTURES: set PATH_VIDEO_SHOTS to a folder, and the report is photographed there at 1440 and 390
 * pixels wide, light and dark, and at 1440 in Chinese. Nothing is written anywhere when it is not set.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
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

const LABEL = 'Demo: the gripper closes on the test cube'
const ELSEWHERE_LABEL = 'Demo recorded on the bench machine'
const OUTSIDE_LABEL = 'Demo kept outside every preview root'
/** A machine that is not this one. Made up. */
const OTHER_MACHINE = 'birch'
/** A path outside every preview root. Made up and never written. */
const OUTSIDE = '/srv/made-up-bench/demo-outside.webm'

let app: LiveApp
let folder: string
let film = ''
let elsewhere = ''
let report = ''
/** Every request the page made for a file's bytes, with its Range and its answer. */
const asked: { url: string; range: string | null; status: number | null }[] = []

beforeAll(async () => {
  mkdirSync(resolve('.logs'), { recursive: true })
  // INSIDE THE CHECKOUT, which is a preview root, so the door may serve the film. Only the film: the office's
  // database is in the temporary folder liveApp makes for each office, because an office refuses a database
  // inside a git worktree (problem nd7jOk5LCU4s), and the database here made this file red in every worktree.
  folder = aTestDatabaseFolder('path-block-video', resolve('.logs'))
  app = await liveApp({
    name: 'path-block-video',
    opensAt: 'full',
    viewport: { width: 1440, height: 1000 },
  })

  const setting = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ mediaLoad: 'with-page' }),
  })
  expect(setting.status, await setting.clone().text()).toBe(200)

  // This browser records the film, so it is one this browser can play.
  await app.page.goto(`${app.site}/`)
  const bytes = await app.page.evaluate(async () => {
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
  film = join(folder, 'gripper-demo.webm')
  writeFileSync(film, Buffer.from(bytes))
  // A path on another machine. Nothing is written there: the door must not read this machine's file.
  elsewhere = join(folder, 'bench-demo.webm')

  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report that points at its demo videos',
      summary: 'Three path blocks of kind video and one of kind code. All test files.',
      data: {
        blocks: [
          { id: 'b-1', type: 'heading', text: 'The demos' },
          { id: 'b-2', type: 'text', text: 'The film below was made by the test. It is not a real recording.' },
          { id: 'b-film', type: 'path', label: LABEL, path: film, kind: 'video' },
          { id: 'b-elsewhere', type: 'path', label: ELSEWHERE_LABEL, path: elsewhere, kind: 'video', machine: OTHER_MACHINE },
          { id: 'b-outside', type: 'path', label: OUTSIDE_LABEL, path: OUTSIDE, kind: 'video' },
          { id: 'b-code', type: 'path', label: 'The test that made it', path: resolve('tests/helpers.ts'), kind: 'code' },
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
}, 60_000)

async function open(query: string): Promise<void> {
  await app.page.goto('about:blank')
  asked.length = 0
  await app.page.goto(`${app.site}/${query}#${recordPath(report)}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
}

/** The path block with this label. */
function blockLabelled(label: string) {
  return app.page.locator('.sb-pathblock', { has: app.page.locator('.sb-path-label', { hasText: label }) })
}

const SAVE_WORDS = { en: 'Save the whole video', zh: '保存完整的视频' } as const

for (const language of ['en', 'zh'] as const) {
  describe(`a path block of kind video, ${language === 'zh' ? 'at ?lang=zh' : 'in English'}`, () => {
    it('draws a player that asks the door for a stretch and plays, and keeps its path line', async () => {
      await open(language === 'zh' ? '?lang=zh' : '')
      const block = blockLabelled(LABEL)
      const player = block.locator('video')
      await player.waitFor({ timeout: 30_000 })

      // HANDED THE DOOR'S ADDRESS, NOT A COPY IN THE PAGE.
      const src = (await player.getAttribute('src')) ?? ''
      expect(src.startsWith('blob:'), src).toBe(false)
      expect(src).toContain(`/api/file?path=${encodeURIComponent(film)}&record=${report}&workspace=default`)
      expect(await player.getAttribute('aria-label')).toBe(LABEL)

      // IT PLAYS: the time moves forward.
      await player.evaluate(async (element) => {
        const media = element as HTMLVideoElement
        media.muted = true
        await media.play()
      })
      await app.page.waitForFunction(
        (label) =>
          [...document.querySelectorAll('.sb-pathblock')].some(
            (one) => one.querySelector('.sb-path-label')?.textContent === label &&
              ((one.querySelector('video') as HTMLVideoElement | null)?.currentTime ?? 0) > 0.3,
          ),
        LABEL,
        { timeout: 30_000 },
      )

      // THE PLAYER ASKED THE DOOR ITSELF, FOR A STRETCH, AND WAS ANSWERED ONE.
      const byThePlayer = asked.filter((one) => one.url === src)
      expect(byThePlayer.length, JSON.stringify(asked)).toBeGreaterThan(0)
      for (const one of byThePlayer) {
        expect(one.range, JSON.stringify(one)).not.toBeNull()
        expect(one.status, JSON.stringify(one)).toBe(206)
      }

      // THE WHOLE FILE IS OFFERED, in the page's language.
      const save = block.locator('a.sb-video-save')
      expect(await save.innerText()).toBe(SAVE_WORDS[language])
      expect(await save.getAttribute('href')).toContain(`&record=${report}&workspace=default&download=1`)

      // THE PATH LINE STAYS: label, kind and path, as they were drawn before.
      expect(await block.locator('.sb-path-kind').innerText()).toBe('video')
      expect(await block.locator('.sb-path code').innerText()).toBe(film)
    }, 120_000)

    it('says why a video on another machine or outside every preview root is not played, and keeps its path', async () => {
      await open(language === 'zh' ? '?lang=zh' : '')
      await blockLabelled(LABEL).locator('video').waitFor({ timeout: 30_000 })
      for (const [label, path, said] of [
        [ELSEWHERE_LABEL, elsewhere, OTHER_MACHINE],
        [OUTSIDE_LABEL, OUTSIDE, 'preview root'],
      ] as const) {
        const block = blockLabelled(label)
        const stand = block.locator('.sb-image-stand[data-preview="refused"]')
        await stand.waitFor({ timeout: 30_000 })
        expect(await stand.innerText(), label).toContain(said)
        expect(await block.locator('video').count(), label).toBe(0)
        expect(await block.locator('.sb-path code').innerText()).toBe(path)
      }
      // The other machine's name is drawn beside the label, in the page's language.
      expect(await blockLabelled(ELSEWHERE_LABEL).locator('.sb-path-head .sb-path-machine').innerText())
        .toBe(language === 'zh' ? `在 ${OTHER_MACHINE} 上` : `on ${OTHER_MACHINE}`)
      // A path block of another kind draws no player and asks the door for nothing.
      const code = blockLabelled('The test that made it')
      expect(await code.locator('video, .sb-image-stand').count()).toBe(0)
      expect(asked.some((one) => one.url.includes(encodeURIComponent(resolve('tests/helpers.ts'))))).toBe(false)
    }, 120_000)
  })
}

describe('the pictures', () => {
  it('draws the player inside the page at 1440 and 390, and photographs it when asked', async () => {
    const output = process.env['PATH_VIDEO_SHOTS']
    if (output !== undefined) mkdirSync(output, { recursive: true })
    const shots: { look: 'light' | 'dark'; width: number; query: string; name: string }[] = [
      { look: 'light', width: 1440, query: '', name: 'path-video-light-1440.png' },
      { look: 'light', width: 390, query: '', name: 'path-video-light-390.png' },
      { look: 'dark', width: 1440, query: '', name: 'path-video-dark-1440.png' },
      { look: 'dark', width: 390, query: '', name: 'path-video-dark-390.png' },
      { look: 'light', width: 1440, query: '?lang=zh', name: 'path-video-zh-light-1440.png' },
    ]
    for (const shot of shots) {
      await app.page.emulateMedia({ colorScheme: shot.look })
      await app.page.setViewportSize({ width: shot.width, height: 1000 })
      await open(shot.query)
      await app.page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), shot.look)
      const player = blockLabelled(LABEL).locator('video')
      await player.waitFor({ timeout: 30_000 })
      // The film's first frame is drawn, so the picture does not catch the player still loading.
      await player.evaluate((element) => new Promise<void>((resolve) => {
        const video = element as HTMLVideoElement
        if (video.readyState >= 2) resolve()
        else video.addEventListener('loadeddata', () => resolve(), { once: true })
      }))
      const fits = await app.page.locator('.sb-pathblock').evaluateAll((blocks) =>
        blocks.every((block) =>
          [block, ...block.querySelectorAll('video')].every((element) => {
            const box = element.getBoundingClientRect()
            return box.left >= 0 && box.right <= innerWidth && box.width > 0
          }),
        ) && document.documentElement.scrollWidth <= innerWidth,
      )
      expect(fits, shot.name).toBe(true)
      if (output !== undefined) await app.page.screenshot({ path: join(output, shot.name), fullPage: true })
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ colorScheme: null })
  }, 180_000)
})
