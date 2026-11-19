// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ATTACH PRESS OPENS THE FILE CHOOSER IN EVERY BROWSER ENGINE INSTALLED HERE (wave 13y, the owner's writing row).
 *
 * tests/one-attach-press-takes-any-file.test.ts proves the attach press in Chromium only. The writing row is to work
 * in WebKit and Firefox as it does in Chromium, on this machine and from a browser paired from another machine. This
 * file runs the same two things in each engine Playwright has installed on the machine it runs on.
 *
 * WHAT THIS FILE PROVES, in each installed engine, against a real office:
 *   1. ON THIS MACHINE, pressing the attach press opens the file chooser, for several files at once and with no type
 *      named. A file that is not a picture is held under its own name, with no picture drawn for it.
 *   2. FROM A PAIRED BROWSER, which pairs through the pairing page on the address other machines call, the same press
 *      opens the chooser, and the file chosen there is held under its own name.
 *
 * AN ENGINE THAT IS NOT INSTALLED IS NOT RUN, AND IS NEVER COUNTED AS PASSED. Each one is named in one line, as a case
 * still to do, so the report says which engines this run did not try. Nothing here installs a browser.
 *
 *   MUTATION A: the press's click no longer reaches the hidden file input. Red on 1 and 2 in every engine run.
 *   MUTATION B: the file input takes one file only. Red on 1 and 2 in every engine run.
 *
 * Everything here is made up: the agent, its line and every file. The servers come from `liveApp` in tests/helpers.ts,
 * on a database in this test's own folder.
 */

import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { type LiveApp, liveApp, trustTheMachineThatCallsThroughTheOtherDoor, waitForThePage } from './helpers.ts'

/** A made-up text file: a file that is not a picture. */
const SOME_NOTES = Buffer.from('Made-up notes for a made-up message.\n')
/** The second address this stack is also served on: the listener a call from another machine arrives on. */
const OTHER_ADDRESS = '127.0.0.2'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The three engines the writing row is to work in, by the name a reader knows them by. */
const ENGINES: readonly (readonly [string, BrowserType])[] = [
  ['Chromium', chromium],
  ['Firefox', firefox],
  ['WebKit', webkit],
]

let app: LiveApp
let ours = ''
let agentId = ''

beforeAll(async () => {
  ours = aTestDatabaseFolder('attach-in-every-engine')
  app = await liveApp({
    name: 'attach-in-every-engine',
    viewport: { width: 1440, height: 1000 },
    workspace: 'default',
    addressForOtherMachines: OTHER_ADDRESS,
    database: join(ours, 'panelx.db'),
  })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Builder', data: { handle: 'made-up-builder', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  // THE OTHER MACHINE IS TRUSTED, as tests/a-picture-is-sent-in-a-message.test.ts says why.
  await trustTheMachineThatCallsThroughTheOtherDoor({ api: app.api, keysFile: join(ours, 'keys.json') }, `http://${OTHER_ADDRESS}:${String(app.apiPort)}`)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-builder')?.id ?? ''
  expect(agentId, 'made-up-builder has no registry row').not.toBe('')
  // ONE LINE SO THE CONVERSATION EXISTS.
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-builder' },
    body: JSON.stringify({ kind: 'message', title: 'Ready', data: { body: 'Made-up line: ready when you are.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (ours !== '') rmSync(ours, { recursive: true, force: true })
}, 60_000)

/** A page in this engine, with the chat in its window, at this address. */
async function aPage(browser: Browser, site: string, path: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.language', 'en')
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'yes')
  })
  const page = await context.newPage()
  await page.goto(`${site}/#${path}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  return { page, close: () => context.close() }
}

/** Open the conversation with the made-up agent and wait for its writing box. */
async function openTheConversation(page: Page): Promise<void> {
  await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
  await page.waitForSelector('.px-chat-them', { timeout: 30_000 })
  await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
}

/** Press the attach press, and say what the chooser it opened takes; then hand it the made-up notes and wait for them to be held. */
async function pressAttachAndChoose(page: Page, name: string): Promise<{ several: boolean; types: string | null; held: string | null; pictures: number }> {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), page.click('.px-chat-write .px-chat-attach-add')])
  const several = chooser.isMultiple()
  const types = await page.locator('.px-chat-attach-file').getAttribute('accept')
  await chooser.setFiles({ name, mimeType: 'text/plain', buffer: SOME_NOTES })
  await page.waitForSelector('.px-chat-attach-held', { timeout: 15_000 })
  return {
    several,
    types,
    held: await page.textContent('.px-chat-attach-held .px-chat-attach-name'),
    pictures: await page.locator('.px-chat-attach-held img').count(),
  }
}

/** Pair this engine's browser through the pairing page on the other address, with the owner confirming on loopback. */
async function pair(page: Page): Promise<void> {
  const askPress = page.getByRole('button', { name: 'Ask to pair this browser' })
  await askPress.waitFor({ timeout: 30_000 })
  const name = (await page.locator('.pair-device').first().textContent())?.trim() ?? ''
  await askPress.click()
  const deadline = Date.now() + 30_000
  let waiting: { id: string } | undefined
  while (waiting === undefined && Date.now() < deadline) {
    const listed = (await (await fetch(`${app.api}/api/office/visitors`, { headers: AS_THE_OWNER })).json()) as {
      credentials: { id: string; handle: string; standing: string }[]
    }
    waiting = listed.credentials.find((one) => one.handle === name && one.standing === 'pending')
    if (waiting === undefined) await new Promise((resolve) => setTimeout(resolve, 250))
  }
  expect(waiting, `no pending credential was issued for "${name}"`).toBeDefined()
  const confirmed = await fetch(`${app.api}/api/office/visitors/${String(waiting?.id)}/confirm`, { method: 'POST', headers: AS_THE_OWNER, body: '{}' })
  expect(confirmed.status, await confirmed.clone().text()).toBe(200)
}

for (const [name, engine] of ENGINES) {
  if (!existsSync(engine.executablePath())) {
    it.todo(`${name} is not installed on this machine, so the attach press was not tried in it`)
    continue
  }

  describe(`the attach press in ${name}`, () => {
    let browser: Browser | undefined
    beforeAll(async () => {
      browser = await engine.launch()
    }, 120_000)
    afterAll(async () => {
      await browser?.close()
    }, 60_000)

    it('1. opens the file chooser on this machine, for several files of any kind, and holds a file that is not a picture', async () => {
      if (browser === undefined) throw new Error(`${name} did not start`)
      const { page, close } = await aPage(browser, app.site, '/')
      try {
        await openTheConversation(page)
        expect(await pressAttachAndChoose(page, 'notes.txt')).toEqual({ several: true, types: null, held: 'notes.txt', pictures: 0 })
      } finally {
        await close()
      }
    }, 120_000)

    it('2. opens the file chooser from a browser paired from another machine, and holds the file chosen there', async () => {
      if (browser === undefined) throw new Error(`${name} did not start`)
      const other = `http://${OTHER_ADDRESS}:${String(app.webPort)}`
      const { page, close } = await aPage(browser, other, '/pairing')
      try {
        await pair(page)
        await page.goto(`${other}/#/`, { timeout: 60_000 })
        await waitForThePage(page, 60_000)
        await openTheConversation(page)
        expect(await pressAttachAndChoose(page, 'from-the-other-machine.txt')).toEqual({ several: true, types: null, held: 'from-the-other-machine.txt', pictures: 0 })
      } finally {
        await close()
      }
    }, 180_000)
  })
}
