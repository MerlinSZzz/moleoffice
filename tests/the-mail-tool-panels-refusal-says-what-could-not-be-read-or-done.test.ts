// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIL TOOL PANEL'S REFUSALS SAY WHAT COULD NOT BE READ OR DONE, NOT ONLY "FAILED."
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------------------
 *
 * The mail tool panel draws three refusals with a bold title over them:
 *
 *   1. the reading of the mail tool on the Settings page was refused;
 *   2. one of the three presses was refused: install, turn off, or take the key back;
 *   3. the closed folded entry reads the mail tool too, and its reading was refused.
 *
 * Since wave 13y round 125 (item 62, layout A) the entry has no fold: it is open whenever the Tools category is
 * chosen, and the mail tool is read once, by the panel inside it. So the third refusal is the first one, drawn once,
 * and the third case reads it in the entry chosen from the list, with no address naming the panel.
 *
 * Before this change each one passed no title, so the shared word "Failed." (Chinese:
 * "失败。") stood over a sentence the reader had to read to learn what had failed. This file
 * requires the reading's title to say the state could not be read, and the press's title to
 * say which press failed.
 *
 * ---------------------------------------------------------------------------------------
 * THE TRANSLATED TITLES
 * ---------------------------------------------------------------------------------------
 *
 * Each language reads the operation's own title key. The title still differs from the generic
 * failure word, the refused press writes nothing, and every translated title has Chinese.
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
 * The test file's own home is supplied by the runner's setup file; this file does not move
 * HOME. The install press would write the tool's folder and key under the home, and its
 * systemd unit under the home; this file compares both before and after the press and requires
 * the refused press to have written nothing there.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF
 * ---------------------------------------------------------------------------------------
 *
 * Removing `label={t('settingsPanel.mailtool.unread')}` from the first note in
 * InstallTheMailTool.tsx turns both drawn reading cases red, because the title is back to
 * "Failed." and "失败。". Putting the line back turns them green again.
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
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'
import { theMailToolFolder, theMailToolUnitPath } from '../src/config/the-mail-tool.mjs'
import type { BuiltServer } from '../src/server/index.ts'

/** An invented agent of the throwaway office. It is a worker and is not the person. */
const AGENT = { handle: 'a-worker-who-reads-the-mail-tool', name: 'A worker who reads the mail tool' }

/** Read the operation-specific title in the language the page draws. */
function titles(language: 'en' | 'zh') {
  const { t } = createI18n(language)
  return {
    unread: t('settingsPanel.mailtool.unread'),
    install: t('settingsPanel.mailtool.install.failed'),
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

/** Open a page in this browser, at the language the query names, and wait for what the case needs. */
async function open(page: Page, path: string, wait: string, query: string): Promise<void> {
  await page.goto(`${live.site}/?${query}#${path}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(wait).first().waitFor({ timeout: 30_000 })
}

/** The bold title a refusal draws, once it is on the page. The first is the reading, the second the press. */
async function titleOf(page: Page, selector: string, index = 0): Promise<string> {
  const strong = page.locator(selector).nth(index)
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

/** A file's size and modification time, or null when it is not there. */
function whatIsAt(path: string): string | null {
  if (!existsSync(path)) return null
  const held = statSync(path)
  return `${String(held.size)}:${String(held.mtimeMs)}`
}

beforeAll(async () => {
  database = await freshDb()
  inProcess = await apiApp()
  await inProcess.app.ready()
  await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: AGENT.handle, name: AGENT.name, role: 'worker' })
  live = await liveApp({ name: 'r72-mail-tool-titles', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: database.file })
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

describe('the mail tool panel draws a title that says what failed', () => {
  it('says in English what could not be read, and what the install press could not do', async () => {
    const words = titles('en')
    await live.page.setViewportSize({ width: 1440, height: 1000 })
    await open(live.page, '/settings/mailtool', 'section.sf-tool .imt-stack > .px-error', 'lang=en')

    const unread = await titleOf(live.page, 'section.sf-tool .imt-stack > .px-error strong', 0)
    expect(unread, 'the reading of the mail tool').toBe(words.unread)
    expect(unread, 'the reading of the mail tool').not.toBe(words.failed)

    // THE PRESS WOULD WRITE THE TOOL'S FOLDER AND KEY, AND ITS UNIT, UNDER THE HOME. The door refuses
    // an agent before either is made (src/server/api/summons.ts), and this compares both.
    const toolFolder = theMailToolFolder(process.env, homedir())
    const unit = theMailToolUnitPath(homedir())
    const before = { folder: whatIsUnder(toolFolder), unit: whatIsAt(unit) }

    await live.page.getByRole('button', { name: en['settingsPanel.mailtool.install'], exact: true }).click()
    const refused = await titleOf(live.page, 'section.sf-tool .imt-stack > .px-error strong', 1)
    expect(refused, 'the install press refusal').toBe(words.install)
    expect(refused, 'the install press refusal').not.toBe(words.failed)
    expect({ folder: whatIsUnder(toolFolder), unit: whatIsAt(unit) }, 'the refused press wrote under the home').toEqual(before)
  }, 300_000)

  it('says on a Chinese page what could not be read or done', async () => {
    const words = titles('zh')
    await live.page.setViewportSize({ width: 1440, height: 1000 })
    await open(live.page, '/settings/mailtool', 'section.sf-tool .imt-stack > .px-error', 'lang=zh')

    const unread = await titleOf(live.page, 'section.sf-tool .imt-stack > .px-error strong', 0)
    expect(unread, 'the reading of the mail tool').toBe(words.unread)
    expect(unread, 'the reading of the mail tool').not.toBe(words.failed)

    const toolFolder = theMailToolFolder(process.env, homedir())
    const unit = theMailToolUnitPath(homedir())
    const before = { folder: whatIsUnder(toolFolder), unit: whatIsAt(unit) }

    await live.page.getByRole('button', { name: zh['settingsPanel.mailtool.install'], exact: true }).click()
    const refused = await titleOf(live.page, 'section.sf-tool .imt-stack > .px-error strong', 1)
    expect(refused, 'the install press refusal').toBe(words.install)
    expect(refused, 'the install press refusal').not.toBe(words.failed)
    expect({ folder: whatIsUnder(toolFolder), unit: whatIsAt(unit) }, 'the refused press wrote under the home').toEqual(before)
  }, 300_000)

  it('says in the entry chosen from the list what could not be read, once, in both languages', async () => {
    await live.page.setViewportSize({ width: 1440, height: 1000 })
    for (const language of ['en', 'zh'] as const) {
      const words = titles(language)
      // No address names the panel: the Tools category is chosen in the list, as a person would.
      await open(live.page, '/settings', '.set .sf-jump', `lang=${language}`)
      await live.page.locator('.set .sf-jump[data-category="tools"]').click()
      const title = await titleOf(live.page, 'section.sf-tool .px-error strong')
      expect(title, `the entry's reading refusal on a ${language} page`).toBe(words.unread)
      expect(title, `the entry's reading refusal on a ${language} page`).not.toBe(words.failed)
      // The entry is read once, by the panel inside it, so the refusal is drawn once.
      expect(await live.page.locator('section.sf-tool .px-error').count(), `the entry on a ${language} page`).toBe(1)
    }
  }, 300_000)

})
