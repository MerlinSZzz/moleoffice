// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ANSWER TO A SAVE IS IN THE PAGE'S LANGUAGE. Wave 13k round 43, piece 1.
 *
 * A record page draws what a save did under the box somebody saved: "Saved. What changed: command." It was
 * the server's English sentence, drawn as it came, so a Chinese page answered a save in English. The server
 * keeps that English for agents. The page now builds the same sentence from the reply's four lists of paths,
 * with `saveAnswer` (src/shared/save-answer.ts), in the page's words, naming the field as its box's label
 * does.
 *
 * WHAT THIS FILE PROVES, in a real browser, in English and in Chinese:
 *   1. a save that changed a field answers `saveAnswer.changed`, naming the field by its label on the page;
 *   2. the same value saved again answers `saveAnswer.unchanged`;
 *   3. the server's own reply still says the English sentence, for agents.
 *
 * MUTATION, after a control run (the commit that added this file names the logs): in `savedHere`
 * (src/web/pages/RecordPage.tsx), draw `outcome.note`, the server's English, as before this round. The
 * Chinese cases go red; the English ones stay green, since the two sentences are then the same.
 *
 * Everything here is made up. `liveApp` starts its own API on ports of its own with a database of its own.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { editingAddress, recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp

async function aTask(title: string): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ kind: 'task', title, data: { state: 'todo' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

/** Open the task's declared fields, open the box for `command`, type `value` and save it. */
async function saveTheCommand(value: string): Promise<{ label: string; said: string }> {
  const row = app.page.locator('[data-testid="declared-fields"] li.fw-row').filter({ has: app.page.locator('code.fw-key', { hasText: /^command$/ }) })
  const form = row.locator('form.fw-form')
  if (!(await form.isVisible())) await row.locator('.fw-head button').click()
  await form.waitFor({ state: 'visible', timeout: 30_000 })
  const label = ((await form.locator('label.px-label').last().textContent()) ?? '').trim()
  await form.locator('textarea, input').last().fill(value)
  await form.locator('button[type="submit"]').click()
  const said = form.locator('p.rp-said')
  await said.waitFor({ state: 'visible', timeout: 30_000 })
  return { label, said: (await said.textContent()) ?? '' }
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-save-answer-in-the-page-language', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // THE PAGE READS AS THE PERSON, in Developer mode, where the declared fields can be opened.
  await app.page.addInitScript(({ person }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
    localStorage.setItem('mole-office.mode', 'inspect')
  }, { person: THE_PERSON })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

for (const lang of ['en', 'zh'] as const) {
  const words = createI18n(lang).t

  it(`a save answers what it did in the page's language (${lang})`, async () => {
    const id = await aTask(`Fire the test kiln (${lang})`)
    await app.page.goto('about:blank')
    await app.page.goto(`${app.site}/?lang=${lang}#${editingAddress(recordPath(id))}`)
    await waitForThePage(app.page, 60_000)
    const fold = app.page.locator('[data-testid="declared-fields"] > summary')
    await fold.waitFor({ timeout: 30_000 })
    await fold.click()

    const first = await saveTheCommand('make fire-kiln')
    expect(first.label.length, 'the box has a label').toBeGreaterThan(0)
    expect(first.said).toBe(words('saveAnswer.changed', { fields: first.label, n: 1 }))

    const again = await saveTheCommand('make fire-kiln')
    expect(again.said).toBe(words('saveAnswer.unchanged', { fields: again.label, n: 1 }))
    if (lang === 'zh') expect(again.said, 'no English on a Chinese page').not.toMatch(/Nothing was written/)
  }, 180_000)
}

it('the server still answers an agent in English', async () => {
  const id = await aTask('Fire the second kiln')
  const reply = await fetch(`${app.api}/api/records/${id}`, {
    method: 'PATCH',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ dataPatch: { command: 'make fire-kiln' } }),
  })
  expect(reply.status, await reply.clone().text()).toBe(200)
  const said = (await reply.json()) as { dataPatch: { note: string } }
  expect(said.dataPatch.note).toBe('Saved. What changed: command.')
})
