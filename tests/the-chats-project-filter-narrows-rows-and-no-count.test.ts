// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The chat project filter narrows agent rows by live agent membership, while unread counts stay unchanged.
 * It draws every project an agent belongs to and keeps the chosen filter across reloads.
 * Messages about another project do not put an agent in that project.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { t } from '../src/shared/i18n.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const inProject = (project: string, handle: string) => ({
  ...AS_THE_OWNER,
  'x-mole-office-workspace': project,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

async function post(url: string, headers: Record<string, string>, body: object): Promise<void> {
  const reply = await fetch(`${app.api}${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.status, `${url}: ${await reply.clone().text()}`).toBeLessThan(300)
}

async function say(project: string, handle: string, body: string, extra: Record<string, unknown> = {}): Promise<void> {
  await post('/api/records', inProject(project, handle), {
    kind: 'message',
    title: body,
    data: { body, to: [{ kind: 'person', id: THE_PERSON }], ...extra },
  })
}

async function openThePanel(): Promise<void> {
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="contacts"] .px-chat-contact', { timeout: 20_000 })
  // THE PROJECTS ARE READ, so the control names them and the marks are drawn.
  await app.page.waitForSelector('.px-chat-project-filter option[value="harbour"]', { state: 'attached', timeout: 20_000 })
}

/** The names on the Contacts tab's rows, in the order drawn. */
async function theRows(): Promise<string[]> {
  return app.page.$$eval('.px-chat-under-tabs[data-showing="contacts"] .px-chat-contact .px-chat-name', (all) =>
    all.map((one) => (one.textContent ?? '').trim()),
  )
}

/**
 * The numbers on the tabs and the number on the sidebar's Chat row. This test chooses the unread-only button, so the
 * corner circle does not stay while the chat is open, and the sidebar's row carries the count.
 */
async function theCounts(): Promise<{ contacts: string | null; groups: string | null; chatRow: string | null }> {
  return {
    contacts: await app.page.$eval('.px-chat-tab[data-tab="contacts"]', (tab) => tab.querySelector('.px-chat-unread')?.textContent ?? null),
    groups: await app.page.$eval('.px-chat-tab[data-tab="groups"]', (tab) => tab.querySelector('.px-chat-unread')?.textContent ?? null),
    chatRow: await app.page.$eval('.shell-chat', (row) => row.querySelector('.shell-chat-count')?.textContent ?? null),
  }
}

async function choose(project: string): Promise<void> {
  await app.page.selectOption('.px-chat-project-filter', project)
}

/**
 * THE PICTURES FOR A REVIEWER, at the four widths in both themes, taken only when CHAT_PROJECT_FILTER_SHOTS names a
 * folder. The control and mutation runs leave it unset and take none. The panel fills the window for them, so the rows
 * under the agents' heading are on the screen and not below the corner window's fold; it goes back to the corner after.
 */
async function photograph(state: string): Promise<void> {
  const dir = process.env['CHAT_PROJECT_FILTER_SHOTS']
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  await app.page.click(`.px-chat-fill[aria-label="${CHAT_WORDS.fillTheWindow}"]`)
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.waitForTimeout(150)
      await app.page.screenshot({ path: `${dir}/chat-side-list-${state}-${String(width)}-${theme}.png` })
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
  await app.page.click(`.px-chat-fill[aria-label="${CHAT_WORDS.backToTheCorner}"]`)
}

const OURS = ['Marked Three', 'Only Harbour', 'Only Orchard']
const ours = (rows: string[]) => rows.filter((one) => OURS.includes(one)).sort()

beforeAll(async () => {
  app = await liveApp({ name: 'chat-project-filter', viewport: { width: 1440, height: 1000 } })
  // This test reads the count on the sidebar's Chat row, which carries it only while the button stays for unread messages.
  const unreadOnly = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ chatButtonStays: 'when-unread' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  for (const [id, title] of [['orchard', 'Test: Orchard'], ['harbour', 'Test: Harbour'], ['lantern', 'Test: Lantern']]) {
    await post('/api/workspaces', AS_THE_OWNER, { id, title })
  }
  for (const [handle, name] of [['marked-three', 'Marked Three'], ['only-orchard', 'Only Orchard'], ['only-harbour', 'Only Harbour']]) {
    await post('/api/agents/started', AS_THE_OWNER, { handle, name, role: 'worker' })
  }
  for (const [handle, projects] of [
    ['marked-three', ['orchard', 'harbour', 'lantern']],
    ['only-orchard', ['orchard']],
    ['only-harbour', ['harbour']],
  ] as const) {
    for (const project of projects) {
      await post('/api/records', { ...AS_THE_OWNER, 'x-mole-office-workspace': project }, {
        kind: 'agent', title: 'Made-up project membership', data: { handle, runtime: 'claude-code', state: 'active' },
      })
    }
  }
  await say('orchard', 'marked-three', 'Test: first, in orchard.')
  await say('harbour', 'marked-three', 'Test: second, in harbour.')
  await say('harbour', 'marked-three', 'Test: third, in harbour, about lantern.', { aboutProject: 'lantern' })
  await say('orchard', 'only-orchard', 'Test: only in orchard.')
  await say('harbour', 'only-harbour', 'Test: only in harbour.', { aboutProject: 'lantern' })
  await openThePanel()
}, 180_000)

afterAll(async () => {
  await app.stop()
})

let before: Awaited<ReturnType<typeof theCounts>>

describe("the chat's project filter", () => {
  it('1. offers every project, shows every conversation, and marks each agent with all its memberships', async () => {
    const options = await app.page.$$eval('.px-chat-project-filter option', (all) =>
      all.map((one) => ({ value: (one as HTMLOptionElement).value, text: (one.textContent ?? '').trim() })),
    )
    expect(options[0]).toEqual({ value: '', text: t('chat.projects.all') })
    expect(options).toEqual(
      expect.arrayContaining([
        { value: 'orchard', text: 'Test: Orchard' },
        { value: 'harbour', text: 'Test: Harbour' },
        { value: 'lantern', text: 'Test: Lantern' },
      ]),
    )
    expect(await app.page.inputValue('.px-chat-project-filter')).toBe('')
    expect(ours(await theRows())).toEqual(OURS)
    const row = app.page.locator('.px-chat-contact', { hasText: 'Marked Three' })
    const defaultProject = options.find((option) => option.value === 'default')
    expect(defaultProject).toBeDefined()
    await expect.poll(async () => (await row.locator('[data-agent-project]').allTextContents()).sort()).toEqual(
      [defaultProject!.text, 'Test: Orchard', 'Test: Harbour', 'Test: Lantern'].sort(),
    )
    const one = app.page.locator('.px-chat-contact', { hasText: 'Only Orchard' })
    expect((await one.locator('[data-agent-project]').allTextContents()).sort()).toEqual([defaultProject!.text, 'Test: Orchard'].sort())
    before = await theCounts()
    // THE CONTROL FOR CASE 2: there is a number to keep, on the tab and on the sidebar's row.
    expect(before.contacts).toBe('5')
    expect(before.chatRow).not.toBeNull()
    await photograph('all-projects')
  })

  it('2. under one project shows only its conversations, and every count stays as it was', async () => {
    await choose('orchard')
    await expect.poll(async () => ours(await theRows())).toEqual(['Marked Three', 'Only Orchard'])
    expect(await theCounts()).toEqual(before)
    await choose('harbour')
    await expect.poll(async () => ours(await theRows())).toEqual(['Marked Three', 'Only Harbour'])
    expect(await theCounts()).toEqual(before)
    await photograph('one-project')
  })

  it('3. keeps the membership filter through a reload and excludes a message-only project', async () => {
    await choose('lantern')
    await expect.poll(async () => ours(await theRows())).toEqual(['Marked Three'])
    await openThePanel()
    expect(await app.page.inputValue('.px-chat-project-filter')).toBe('lantern')
    await expect.poll(async () => ours(await theRows())).toEqual(['Marked Three'])
    expect(await theCounts()).toEqual(before)
    await photograph('a-row-with-two-marks')
  })

  it('4. shows every conversation again under "All projects"', async () => {
    await choose('')
    await expect.poll(async () => ours(await theRows())).toEqual(OURS)
    expect(await theCounts()).toEqual(before)
  })
})
