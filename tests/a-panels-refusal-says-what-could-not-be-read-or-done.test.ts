// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PANEL'S REFUSAL SAYS WHAT COULD NOT BE READ OR DONE, NOT ONLY "FAILED."
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Three panels draw a refusal with a bold title over it: start at login (on Terminal
 * management), the sandboxes' memory limit (on Settings), and the press that puts the Mole
 * Office entry in place (on Settings). Before this change each one passed no title, so the
 * shared word "Failed." (Chinese: "失败。") stood over a sentence the reader had to read to
 * learn what had failed. This file requires each title to say what could not be read, or what
 * was not put in place.
 *
 * ---------------------------------------------------------------------------------------
 * THE TRANSLATED TITLES
 * ---------------------------------------------------------------------------------------
 *
 * Both pages read the refusal's own word key in their language. Every title still differs
 * from the generic failure word.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL
 * ---------------------------------------------------------------------------------------
 *
 * A throwaway office and database made by tests/helpers.ts, whose doors answer for real. The
 * browser acts as a made-up worker of that office, registered through the in-process app as
 * the person. It holds no person's key, so every refusal below is the door answering an agent
 * that is not the person, and nothing is stubbed or routed around.
 *
 * The entry panel is opened with `mode=inspect`, as it was when only Developer mode drew it. The
 * test file's own home is supplied by the runner's setup file; this file does not move HOME.
 * After the entry press it compares what is under the home's `.claude` before and after, and
 * requires the refused press to have written nothing there.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF
 * ---------------------------------------------------------------------------------------
 *
 * Removing `label={t('startAtLogin.unread')}` from the first note in StartAtLogin.tsx turns
 * both drawn cases red, because the title is back to "Failed." and "失败。". Putting the line
 * back turns them green again.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEVICE_HALF_COOKIE, KEY_COOKIE } from '../src/config/key-header.mjs'
import type { Page } from 'playwright'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import type { BuiltServer } from '../src/server/index.ts'

/** An invented agent of the throwaway office. It is a worker and is not the person. */
const AGENT = { handle: 'a-worker-who-reads-a-panel', name: 'A worker who reads a panel' }

/** Read the current words while keeping each operation bound to its own title. */
function titles(language: 'en' | 'zh') {
  const { t } = createI18n(language)
  return {
    startAtLogin: t('startAtLogin.unread'),
    sandboxCap: t('sandboxCap.unread'),
    entry: t('settingsPanel.entry.notPut'),
    failed: t('error.failed'),
  }
}

let database: TestDb
let inProcess: BuiltServer
let live: LiveApp

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: Record<string, unknown>) {
  const reply = await inProcess.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  expect(reply.statusCode, `${method} ${url}: ${reply.body}`).toBeLessThan(300)
  return reply.json() as Record<string, unknown>
}

/** Open a page in this browser, at the language and mode the query names, and wait for what the case needs. */
async function open(page: Page, path: string, wait: string, query: string): Promise<void> {
  await page.goto(`${live.site}/?${query}#${path}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(wait).first().waitFor({ timeout: 30_000 })
}

/** The bold title a refusal draws, once it is on the page. */
async function titleOf(page: Page, selector: string): Promise<string> {
  const strong = page.locator(selector).first()
  await strong.waitFor({ timeout: 30_000 })
  return (await strong.innerText()).trim()
}

/** Every name, size and modification time under a folder, so a write before and after shows. */
function whatIsUnder(folder: string): string[] {
  if (!existsSync(folder)) return []
  const found: string[] = []
  const walk = (at: string, prefix: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const next = join(at, entry.name)
      const name = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) {
        found.push(`${name}/`)
        walk(next, name)
      } else {
        const held = statSync(next)
        found.push(`${name}:${String(held.size)}:${String(held.mtimeMs)}`)
      }
    }
  }
  walk(folder, '')
  return found
}

beforeAll(async () => {
  database = await freshDb()
  inProcess = await apiApp()
  await inProcess.app.ready()
  await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: AGENT.handle, name: AGENT.name, role: 'worker' })
  live = await liveApp({ name: 'r71-refusal-titles', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: database.file })
  await live.page.addInitScript((who) => localStorage.setItem('mole-office.actor', JSON.stringify(who)), { type: 'agent', id: AGENT.handle })
  await live.page.addInitScript((theme) => localStorage.setItem('mole-office.preset.theme', theme), 'light')
  const held = await live.context.cookies()
  expect(held.some((one) => one.name === KEY_COOKIE || one.name === DEVICE_HALF_COOKIE), 'the browser was given the person key or a half of a device key').toBe(false)
}, 240_000)

afterAll(async () => {
  await live?.stop()
  await inProcess?.app.close()
  database?.close()
}, 240_000)

describe('a panel draws a title that says what failed', () => {
  it('says in English what could not be read, and what was not put in place', async () => {
    const words = titles('en')
    await live.page.setViewportSize({ width: 1440, height: 1000 })

    await open(live.page, '/terminals', 'main section.sal .px-error', 'lang=en')
    const startAtLogin = await titleOf(live.page, 'main section.sal .px-error strong')
    expect(startAtLogin, 'the start-at-login reading refusal').toBe(words.startAtLogin)
    expect(startAtLogin, 'the start-at-login reading refusal').not.toBe(words.failed)

    await open(live.page, '/settings/sandboxmemory', 'main section.smc .px-error', 'lang=en')
    const sandboxCap = await titleOf(live.page, 'main section.smc .px-error strong')
    expect(sandboxCap, 'the memory limit reading refusal').toBe(words.sandboxCap)
    expect(sandboxCap, 'the memory limit reading refusal').not.toBe(words.failed)

    await open(live.page, '/settings/entry', 'section.px-panel:has(.ite-stack)', 'lang=en&mode=inspect')
    const claude = join(homedir(), '.claude')
    const before = whatIsUnder(claude)
    await live.page.locator('.ite-stack button').first().click()
    const entry = await titleOf(live.page, 'section.px-panel:has(.ite-stack) .px-error strong')
    expect(entry, 'the entry press refusal').toBe(words.entry)
    expect(entry, 'the entry press refusal').not.toBe(words.failed)
    expect(whatIsUnder(claude), 'the refused press wrote into the home folder').toEqual(before)
  }, 300_000)

  it('says on a Chinese page what could not be read or was not put in place', async () => {
    const words = titles('zh')
    await live.page.setViewportSize({ width: 1440, height: 1000 })

    await open(live.page, '/terminals', 'main section.sal .px-error', 'lang=zh')
    const startAtLogin = await titleOf(live.page, 'main section.sal .px-error strong')
    expect(startAtLogin, 'the start-at-login reading refusal').toBe(words.startAtLogin)
    expect(startAtLogin, 'the start-at-login reading refusal').not.toBe(words.failed)

    await open(live.page, '/settings/sandboxmemory', 'main section.smc .px-error', 'lang=zh')
    const sandboxCap = await titleOf(live.page, 'main section.smc .px-error strong')
    expect(sandboxCap, 'the memory limit reading refusal').toBe(words.sandboxCap)
    expect(sandboxCap, 'the memory limit reading refusal').not.toBe(words.failed)

    await open(live.page, '/settings/entry', 'section.px-panel:has(.ite-stack)', 'lang=zh&mode=inspect')
    const claude = join(homedir(), '.claude')
    const before = whatIsUnder(claude)
    await live.page.locator('.ite-stack button').first().click()
    const entry = await titleOf(live.page, 'section.px-panel:has(.ite-stack) .px-error strong')
    expect(entry, 'the entry press refusal').toBe(words.entry)
    expect(entry, 'the entry press refusal').not.toBe(words.failed)
    expect(whatIsUnder(claude), 'the refused press wrote into the home folder').toEqual(before)
  }, 300_000)

})
