// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NOTE OF ANOTHER PROJECT SAVES WHERE IT BELONGS. Point NU-4 of the notes after the person's use of 21 November: a
 * note kept in one project, written while another project was open, was refused with "is in another project", so
 * neither a save nor Done kept it, and Done did not close it.
 *
 * The note is filed in one made-up project. In the first case it is opened from My notes there, floating over the page,
 * and then another made-up project is chosen. In the second case the other project is chosen first and the note's own
 * page is opened at its address. In both, a change is saved, Done is pressed after another change, and the note closes.
 * Each change is read back from the office in the note's own project, which the note is still kept in.
 *
 * Everything here is made up and its words say so. The database is the test's own.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Locator, Page } from 'playwright'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { quickNotePath } from '../src/web/components/router.tsx'
import { liveApp, openRecordPagesAt, theAnswerToAWriteInATestOffice, waitForThePage, type LiveApp } from './helpers.ts'
import { switchTheProject, theProjectIdOnScreen, waitForTheProjects } from './switch-the-project.ts'

const THE_NOTES_PROJECT = 'default'
const THE_OTHER_PROJECT = { id: 'test-made-up-garden', title: 'Made-up garden' }
const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'note-of-another-project', workspace: THE_NOTES_PROJECT, viewport: { width: 1440, height: 900 } })
  const headers = { ...AS_THE_PERSON, 'x-mole-office-workspace': THE_NOTES_PROJECT }
  const made = await fetch(`${app.api}/api/workspaces`, { method: 'POST', headers, body: JSON.stringify(THE_OTHER_PROJECT) })
  expect(made.status, await made.text()).toBeLessThan(300)
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

/** A made-up note, filed in the note's own project. */
async function aNote(words: string): Promise<string> {
  const headers = { ...AS_THE_PERSON, 'x-mole-office-workspace': THE_NOTES_PROJECT }
  const input = { kind: 'quick_note', title: words, data: { parts: [{ id: 'words-1', type: 'words', x: 24, y: 16, width: 320, text: words }] } }
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(input) })
  const body = await reply.text()
  expect(reply.status, body).toBe(theAnswerToAWriteInATestOffice(headers, input))
  return (JSON.parse(body) as { record: { id: string } }).record.id
}

/** What the office keeps of the note, read in the note's own project. */
async function theKeptNote(id: string): Promise<{ title: string; workspaceId: string }> {
  const reply = await fetch(`${app.api}/api/records/${encodeURIComponent(id)}`, { headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': THE_NOTES_PROJECT } })
  const body = await reply.text()
  expect(reply.status, body).toBe(200)
  const { record } = JSON.parse(body) as { record: { title: string; workspaceId: string } }
  return { title: record.title, workspaceId: record.workspaceId }
}

async function go(page: Page, path: string): Promise<void> {
  await page.goto(`${app.site}/?lang=en#${path}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await waitForTheProjects(page)
}

/** Give the note a title, which a save keeps, then wait until the office keeps it in the note's own project. */
async function nameAndRead(note: Locator, id: string, title: string): Promise<void> {
  await note.locator('.qn-title-field').fill(title)
  await expect.poll(async () => (await theKeptNote(id)).title, { timeout: 15_000 }).toBe(title)
}

/** A change, then Done: the note closes, and the office keeps the change in the note's own project. */
async function doneAndRead(scope: Locator, closed: Locator, id: string, title: string): Promise<void> {
  await scope.locator('.qn-title-field').fill(title)
  await scope.getByRole('button', { name: t('quickNote.done'), exact: true }).click()
  await closed.waitFor({ state: 'detached', timeout: 15_000 })
  await expect.poll(async () => (await theKeptNote(id)).title, { timeout: 15_000 }).toBe(title)
}

describe('a note of another project', () => {
  it('saves, and Done closes it, when another project is chosen after it opened over My notes', async () => {
    const id = await aNote('Made-up note of the first project')
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addInitScript(() => localStorage.setItem('mole-office.chat.open', 'no'))
    await openRecordPagesAt(context, 'full')
    const page = await context.newPage()
    try {
      await go(page, '/my-notes')
      await page.locator(`[data-note="${id}"] [data-part="open"]`).click()
      const beside = page.locator('[data-quick-note-beside]')
      await beside.locator('.qn-title-field').waitFor({ timeout: 30_000 })
      await switchTheProject(page, THE_OTHER_PROJECT.id)
      await expect.poll(() => theProjectIdOnScreen(page), { timeout: 15_000 }).toBe(THE_OTHER_PROJECT.id)

      await nameAndRead(beside, id, 'Made-up title saved while another project is open')
      await doneAndRead(beside, beside, id, 'Made-up title kept by Done while another project is open')
      expect((await theKeptNote(id)).workspaceId, 'the note is still kept in its own project').toBe(THE_NOTES_PROJECT)
    } finally { await context.close() }
  }, 180_000)

  it('saves, and Done closes it, on its own page opened while another project is chosen', async () => {
    const id = await aNote('Made-up note opened at its address')
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addInitScript(() => localStorage.setItem('mole-office.chat.open', 'no'))
    await openRecordPagesAt(context, 'full')
    const page = await context.newPage()
    try {
      await go(page, '/')
      await switchTheProject(page, THE_OTHER_PROJECT.id)
      await expect.poll(() => theProjectIdOnScreen(page), { timeout: 15_000 }).toBe(THE_OTHER_PROJECT.id)
      await page.evaluate((path) => { window.location.hash = `#${path}` }, quickNotePath(id))
      const note = page.locator('main.qn-page')
      await note.locator('.qn-title-field').waitFor({ timeout: 30_000 })

      await nameAndRead(note, id, 'Made-up title saved on its page in another project')
      await doneAndRead(note, note, id, 'Made-up title kept by Done on its page in another project')
      expect((await theKeptNote(id)).workspaceId, 'the note is still kept in its own project').toBe(THE_NOTES_PROJECT)
    } finally { await context.close() }
  }, 180_000)
})
