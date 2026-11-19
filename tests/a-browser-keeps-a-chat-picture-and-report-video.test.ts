// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The real page reuses a stored chat picture and report film when they are opened again. */
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { firefox, type Browser, type BrowserContext, type Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { freshDb, openRecordPagesAt, theBrowserThisWorkerShares, theBuiltPage, type TestDb } from './helpers.ts'

const picture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const owner = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let database: TestDb | undefined
let office: FastifyInstance | undefined
let origin = ''
let report = ''
let videoPath = ''
let picturePath = ''
let contact = ''
let pageCode = ''
let firefoxBrowser: Browser | undefined
const answers: { path: string; method: string; status: number }[] = []

async function post(path: string, body: unknown, headers = owner): Promise<any> {
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(response.status, await response.clone().text()).toBeGreaterThanOrEqual(200)
  expect(response.status).toBeLessThan(300)
  return response.json()
}

beforeAll(async () => {
  database = await freshDb()
  const folder = await theBuiltPage()
  const browser = await theBrowserThisWorkerShares()
  const recording = await browser.newContext({ recordVideo: { dir: dirname(database.file), size: { width: 320, height: 180 } }, viewport: { width: 320, height: 180 } })
  const page = await recording.newPage()
  await page.setContent('<body style="background:#346;color:white">Made-up film</body>')
  await page.waitForTimeout(1_000)
  const film = page.video()
  if (film === null) throw new Error('The browser did not record the made-up film')
  await recording.close()
  const filmBytes = readFileSync(await film.path())
  const bundled = await bundlePageCode({ stdin: { contents: 'window.cacheTestReady = (selector) => { const image = document.querySelector(selector); return !!image && image.complete && image.naturalWidth > 0 }', loader: 'js' }, bundle: true, write: false, platform: 'browser' })
  pageCode = bundled.outputFiles[0]!.text
  const { buildApp } = await import('../src/server/index.ts')
  office = (await buildApp({ production: true, webDir: folder, webAppUrl: 'http://localhost:5173', logLevel: false })).app
  office.addHook('onResponse', async (request, reply) => {
    if (!request.url.startsWith('/api/file?')) return
    answers.push({ path: new URL(request.url, 'http://test').searchParams.get('path') ?? '', method: request.method, status: reply.statusCode })
  })
  await office.listen({ port: 0, host: '127.0.0.1' })
  const address = office.server.address()
  if (address === null || typeof address === 'string') throw new Error('The made-up office did not listen')
  origin = `http://127.0.0.1:${String(address.port)}`
  const person = await (await fetch(`${origin}/api/office/owner`)).json() as { named: boolean }
  if (!person.named) await post('/api/office/owner', { name: 'Made-up reader', language: 'en' })
  const video = await post('/api/report-files', { name: 'made-up.webm', bytes: filmBytes.toString('base64') })
  videoPath = video.file.path
  picturePath = (await post('/api/messages/pictures', { bytes: picture.toString('base64') })).picture.path
  report = (await post('/api/records', { kind: 'report', title: 'Made-up film report', data: { blocks: [{ id: 'video', type: 'video', ...video.file, alt: 'Made-up film' }] } })).record.id
  const handle = `cache-test-${String(Date.now())}`
  await post('/api/records', { kind: 'agent', title: 'Made-up contact', data: { handle, runtime: 'claude-code', state: 'active' } })
  const roster = await (await fetch(`${origin}/api/participants`, { headers: owner })).json() as { agents: { id: string; handle: string }[] }
  const agent = roster.agents.find((entry) => entry.handle === handle)
  if (agent === undefined) throw new Error('The made-up contact is missing')
  contact = agent.id
  await post('/api/records', { kind: 'message', title: 'Made-up picture message', data: { body: 'Made-up picture', to: [{ kind: 'person', id: THE_PERSON }], pictures: [{ id: 'picture', type: 'image', path: picturePath, alt: 'Made-up picture' }] } }, { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
}, 240_000)

afterAll(async () => { await firefoxBrowser?.close(); await office?.close(); database?.close() }, 60_000)

async function context(engine: 'chromium' | 'firefox' = 'chromium'): Promise<BrowserContext> {
  if (engine === 'firefox' && firefoxBrowser === undefined) firefoxBrowser = await firefox.launch({ headless: true })
  const browser = engine === 'firefox' ? firefoxBrowser! : await theBrowserThisWorkerShares()
  const result = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await openRecordPagesAt(result, 'full')
  await result.addInitScript({ content: pageCode })
  return result
}

async function drawn(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((value) => (window as unknown as Window & { cacheTestReady: (s: string) => boolean }).cacheTestReady(value), selector, { timeout: 60_000 })
}

function allAnswers(path: string, from: number): { method: string; status: number }[] {
  return answers.slice(from).filter((entry) => entry.path === path).map(({ method, status }) => ({ method, status }))
}

function bodyAnswers(path: string, from: number): number[] {
  return answers.slice(from).filter((entry) => entry.path === path && entry.method === 'GET').map((entry) => entry.status)
}

it('reopening a stored report film does not transfer its body again', async () => {
  const browser = await context()
  try {
    const page = await browser.newPage()
    const first = answers.length
    const open = async () => {
      await page.goto(`${origin}/#/r/${report}`, { timeout: 60_000 })
      await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement | null)?.readyState! >= 1, null, { timeout: 60_000 })
      await page.waitForTimeout(500)
    }
    await open()
    expect(bodyAnswers(videoPath, first)).toContain(206)
    await page.goto(`${origin}/#/settings`)
    await page.locator('video').first().waitFor({ state: 'detached', timeout: 30_000 })
    const again = answers.length
    await open()
    expect(bodyAnswers(videoPath, again).every((status) => status === 304)).toBe(true)
    expect(allAnswers(videoPath, again).every((answer) => answer.status === 304), 'reopening the film asked the server for a full answer').toBe(true)
    const reload = answers.length
    await page.reload({ timeout: 60_000 })
    await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement | null)?.readyState! >= 1, null, { timeout: 60_000 })
    await page.waitForTimeout(500)
    expect(bodyAnswers(videoPath, reload).every((status) => status === 304)).toBe(true)
    expect(allAnswers(videoPath, reload).every((answer) => answer.status === 304), 'reloading the film asked the server for a full answer').toBe(true)
  } finally { await browser.close() }
}, 180_000)

it.each(['chromium', 'firefox'] as const)('reopening a stored chat picture in %s does not ask the server for it again', async (engine) => {
  const browser = await context(engine)
  try {
    const page = await browser.newPage()
    await page.goto(`${origin}/#/r/${report}`, { timeout: 60_000 })
    await page.locator('video').first().waitFor({ timeout: 60_000 })
    const open = async () => {
      if (!(await page.locator('.px-chat').count())) {
        const side = page.locator('.shell-chat')
        if (await side.count() && await side.isVisible() && await side.evaluate((node) => node.tagName === 'BUTTON')) await side.click()
        else await page.locator('.px-chat-circle').click()
      }
      await page.locator('.px-chat').first().waitFor({ timeout: 30_000 })
      const back = page.locator('.px-chat-back')
      if (await back.count() && await back.isVisible()) await back.click()
      await page.locator(`.px-chat-contact[data-contact="agent:${contact}"]`).click({ timeout: 30_000 })
      await drawn(page, '.px-chat-pic img')
      await page.waitForTimeout(500)
    }
    const first = answers.length
    await open()
    expect(bodyAnswers(picturePath, first)).toContain(200)
    const again = answers.length
    await open()
    expect(bodyAnswers(picturePath, again).every((status) => status === 304)).toBe(true)
    expect(allAnswers(picturePath, again).every((answer) => answer.status === 304), 'reopening the picture asked the server for a full answer').toBe(true)
    const reload = answers.length
    await page.reload({ timeout: 60_000 })
    await page.locator('.px-chat').first().waitFor({ timeout: 30_000 })
    if (!(await page.locator('.px-chat-pic img').count())) await open()
    else { await drawn(page, '.px-chat-pic img'); await page.waitForTimeout(500) }
    expect(bodyAnswers(picturePath, reload).every((status) => status === 304)).toBe(true)
    expect(allAnswers(picturePath, reload).every((answer) => answer.status === 304), 'reloading the picture asked the server for a full answer').toBe(true)
  } finally { await browser.close() }
}, 180_000)

it('keeps metadata private under the file policy, and never keeps a saved or unknown type', async () => {
  const file = `/api/file?path=${encodeURIComponent(videoPath)}&open=1&metadata=1`
  const first = await office!.inject({ method: 'GET', url: file, headers: owner })
  expect(first.statusCode, first.body).toBe(200)
  expect(first.json()).toMatchObject({ type: 'video/webm', size: expect.any(Number) })
  expect(first.headers['cache-control']).toBe('private, max-age=31536000, immutable')
  const tag = first.headers.etag
  expect(tag).toBeTruthy()
  for (const header of ['x-mole-office-actor-type', 'x-mole-office-actor-id', 'x-mole-office-session', 'x-mole-office-key', 'x-mole-office-workspace', 'cookie']) {
    expect(String(first.headers.vary).toLowerCase()).toContain(header)
  }
  const held = await office!.inject({ method: 'GET', url: file, headers: { ...owner, 'if-none-match': String(tag) } })
  expect(held.statusCode).toBe(304)
  expect(held.rawPayload.length).toBe(0)
  const saved = await office!.inject({ method: 'GET', url: `${file.replace('&open=1', '')}&download=1`, headers: { ...owner, 'if-none-match': String(tag) } })
  expect(saved.statusCode).toBe(200)
  expect(saved.headers['cache-control']).toBe('no-store')
  expect(saved.headers.etag).toBeUndefined()
  const unknown = await post('/api/report-files', { name: 'made-up.unknown', bytes: picture.toString('base64') })
  await post('/api/records', { kind: 'report', title: 'Made-up unknown file', data: { blocks: [{ id: 'file', type: 'file', ...unknown.file }] } })
  const unshown = await office!.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(unknown.file.path)}&open=1&metadata=1`, headers: owner })
  expect(unshown.statusCode, unshown.body).toBe(200)
  expect(unshown.headers['cache-control']).toBe('no-store')
  expect(unshown.headers.etag).toBeUndefined()
})
