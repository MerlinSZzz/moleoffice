// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
/** A scroll with no input and no size change is kept when pictures later land. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { participantKey } from '../src/shared/messages.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agent = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-reader' }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=', 'base64')
let app: LiveApp
let agentId = ''
let openCode = ''
let pictureFolder = ''

async function file(headers: Record<string, string>, title: string, data: Record<string, unknown>): Promise<void> {
  const body = { kind: 'message', title, data }
  const response = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(response.status, await response.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, body))
}

beforeAll(async () => {
  const bundle = await bundlePageCode({
    stdin: { contents: `import { OPEN_AT } from './src/web/lib/open-chat.ts'; window.openMadeUp = key => window.dispatchEvent(new CustomEvent(OPEN_AT, { detail: key }));`, resolveDir: process.cwd(), sourcefile: 'made-up-open.ts', loader: 'ts' },
    bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
  })
  openCode = bundle.outputFiles![0]!.text
  pictureFolder = mkdtempSync(join(tmpdir(), 'made-up-reading-pictures-'))
  writeFileSync(join(pictureFolder, 'made-up.png'), png)
  const preview = process.env.MOLE_OFFICE_PREVIEW_ROOTS
  process.env.MOLE_OFFICE_PREVIEW_ROOTS = pictureFolder
  try { app = await liveApp({ name: 'the-chat-keeps-a-scroll-without-input', viewport: { width: 1440, height: 1000 }, workspace: 'default' }) }
  finally { if (preview === undefined) delete process.env.MOLE_OFFICE_PREVIEW_ROOTS; else process.env.MOLE_OFFICE_PREVIEW_ROOTS = preview }
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers: person, body: JSON.stringify({ kind: 'agent', title: 'Made-up reader', data: { handle: 'made-up-reader', runtime: 'claude-code', state: 'active' } }) })
  expect(made.status, await made.clone().text()).toBe(201)
  const agents = (await (await fetch(`${app.api}/api/participants`, { headers: person })).json()) as { agents: { id: string; handle: string }[] }
  agentId = agents.agents.find((one) => one.handle === 'made-up-reader')?.id ?? ''
  expect(agentId).not.toBe('')
  for (let n = 1; n <= 65; n++) {
    const body = `Made-up line ${String(n)}. These made-up words leave room to scroll through the conversation.`
    const pictures = n % 8 === 0 ? [{ id: 'p-1', type: 'image', path: join(pictureFolder, 'made-up.png'), alt: 'Made-up image' }] : []
    await file(agent, `Made-up line ${String(n)}`, { body, to: [{ kind: 'person', id: THE_PERSON }], pictures })
  }
}, 240_000)

afterAll(async () => { await app?.stop(); if (pictureFolder !== '') rmSync(pictureFolder, { recursive: true, force: true }) }, 60_000)

it('keeps a scroll without input or a size change when pictures then land', async () => {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
  let release!: () => void
  const held = new Promise<void>((done) => { release = done })
  try {
    await context.addInitScript(() => { localStorage.setItem('mole-office.workspace', 'default'); localStorage.setItem('mole-office.chat.open', 'split'); localStorage.setItem('mole-office.chat.split-side', 'right') })
    const page = await context.newPage()
    // A picture first asks for its type and length as JSON (`metadata=1`), and the office answers that from the real file.
    await page.route(/\/api\/file\?/, async (route) => {
      await held
      if (new URL(route.request().url()).searchParams.get('metadata') === '1') await route.continue().catch(() => undefined)
      else await route.fulfill({ status: 200, contentType: 'image/png', body: png }).catch(() => undefined)
    })
    await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.addScriptTag({ content: openCode })
    await page.evaluate((key) => (window as unknown as { openMadeUp: (key: string) => void }).openMadeUp(key), participantKey({ kind: 'agent', id: agentId }))
    const list = page.locator('.px-chat-said')
    await page.waitForFunction(() => document.querySelectorAll('.px-chat-said .px-chat-words').length >= 50, undefined, { timeout: 30_000 })
    expect(await list.locator('.sb-image-stand').count(), 'pictures must still be loading').toBeGreaterThan(0)
    const box = await list.boundingBox()
    if (box === null) throw new Error('no list')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -1200)
    await page.waitForTimeout(700)
    const before = await list.evaluate((node) => ({ top: node.scrollTop, end: node.scrollHeight - node.clientHeight }))
    // A fling's tail or browser Find can move the list without a wheel, touch, key or size change.
    await list.evaluate((node) => { node.scrollTop -= 300 })
    await expect.poll(() => list.evaluate((node) => node.scrollTop), { timeout: 3_000 }).toBeLessThan(before.top - 250)
    expect(await list.evaluate((node) => node.scrollHeight - node.clientHeight)).toBe(before.end)
    const reading = await list.evaluate((node) => {
      const box = node.getBoundingClientRect()
      const row = [...node.querySelectorAll<HTMLElement>(':scope > li')].find((one) => one.getBoundingClientRect().bottom >= box.top + box.height / 2)
      if (!row) throw new Error('no row at the middle')
      return { words: row.querySelector('.px-chat-words')?.textContent ?? '', at: row.getBoundingClientRect().top - box.bottom }
    })
    release()
    await page.waitForFunction(() => document.querySelectorAll('.px-chat-said .sb-image-stand').length === 0, undefined, { timeout: 30_000 })
    await page.waitForTimeout(800)
    const after = await list.evaluate((node, words) => {
      const row = [...node.querySelectorAll<HTMLElement>(':scope > li')].find((one) => one.querySelector('.px-chat-words')?.textContent === words)
      if (!row) throw new Error('the row is no longer drawn')
      return row.getBoundingClientRect().top - node.getBoundingClientRect().bottom
    }, reading.words)
    expect(Math.abs(after - reading.at), 'the new reading place moved when pictures landed').toBeLessThanOrEqual(1)
  } finally { release(); await context.close() }
}, 120_000)
