// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSAL IN THE TALK BOX IS DRAWN IN THE PAGE'S LANGUAGE (round 43 of wave 13n, wave 13k's message wSeK78G1FmHZ).
 *
 * ErrorNote draws a failure by one rule only when it is given the fault: a coded refusal is the code's sentence from
 * the word lists. The talk box kept only the caught error's message, so a coded refusal was drawn as the server's
 * English on a Chinese page. It now keeps the error as its message and its fault, and draws it with the fault.
 *
 * WHAT THIS FILE PROVES, in a real browser: the person right-clicks a report, writes a comment and presses Start
 * review, and the comment is refused with a code. On an English page and on a Chinese page, the talk box's error note
 * says the code's sentence in the page's language; on the Chinese page that is not the English of the refusal.
 *
 * THE REFUSAL IS THIS TEST'S, NOT THE OFFICE'S. Until wave 13w round 10 the comment held a piece the office took for a
 * key, and the office refused it. Since round 10 the office stores such a comment and reminds, and nothing a person
 * types into the talk box is refused for its words. So the browser answers the
 * comment's POST itself, in the shape of every refusal of the office: 400, `error`, `reason`, `code` and `values`,
 * with the code recordNotFound and English words marked "Test:". The comment never reaches the office.
 * MUTATION: in src/web/components/agent/TalkBox.tsx, drop `fault={failed.fault}` from the ErrorNote under the box.
 * Both cases go red. Until round 10 only the Chinese one did, because the office's English was the code's sentence;
 * the refusal's English here is the test's own.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. Every name here is made up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n, type WordKey } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let reportId = ''
const REPORT_TITLE = 'Synthetic report about gravel grades'

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** What the office answered to the refused comment, and what the talk box drew for it, on a page in this language. */
async function theRefusalAndItsNote(lang: 'en' | 'zh'): Promise<{ code: string | undefined; values: Record<string, string | number>; error: string; drawn: string }> {
  const words = createI18n(lang).t
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}#/r/${reportId}`)
  await waitForThePage(app.page, 60_000)
  await app.page.getByRole('heading', { name: REPORT_TITLE }).first().click({ button: 'right' })
  const box = app.page.locator('.px-talk')
  await box.locator('textarea').first().waitFor({ timeout: 30_000 })
  await box.locator('textarea').first().fill('Synthetic comment on the gravel.')
  await app.page.route('**/api/records', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    // THE SERVER'S OWN HEADERS, from a harmless read of the same server, as in
    // tests/a-coded-refusal-of-a-send-is-drawn-in-the-page-language.test.ts: the page takes a reply without them for
    // another server's.
    const real = await route.fetch({ method: 'GET', url: `${app.api}/api`, postData: '' })
    await route.fulfill({
      response: real,
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Test: the comment was refused.', reason: 'Test: refused.', code: 'recordNotFound', values: {} }),
    })
  })
  const refused = app.page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/api/') && response.status() >= 400)
  await box.getByRole('button', { name: words('talk.startReview'), exact: true }).click()
  const answer = (await (await refused).json()) as { error: string; code?: string; values?: Record<string, string | number> }
  const note = box.locator('.px-error .px-error-msg')
  await note.waitFor({ timeout: 20_000 })
  await app.page.unroute('**/api/records')
  return { code: answer.code, values: answer.values ?? {}, error: answer.error, drawn: (await note.innerText()).trim() }
}

beforeAll(async () => {
  app = await liveApp({ name: 'talk-box-refusal-language', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title: REPORT_TITLE,
      data: { for: 'Robin Vale', date: '2026-10-06', blocks: [{ id: 'b-1', type: 'text', heading: 'Gravel', text: 'One place to look at.' }] },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  reportId = ((await filed.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a refusal in the talk box is drawn in the page language', () => {
  it('draws, on an English page, the sentence of the refusal code', async () => {
    const seen = await theRefusalAndItsNote('en')
    expect(seen.code, `the refusal carries no code: ${seen.error}`).toBeDefined()
    expect(seen.drawn).toBe(createI18n('en').t(`server.${seen.code!}` as WordKey, seen.values))
  }, 120_000)

  it('draws, on a Chinese page, the sentence of the refusal code, and not the English the server wrote', async () => {
    const seen = await theRefusalAndItsNote('zh')
    expect(seen.code, `the refusal carries no code: ${seen.error}`).toBeDefined()
    expect(seen.drawn).not.toBe(seen.error)
    expect(seen.drawn).toBe(createI18n('zh').t(`server.${seen.code!}` as WordKey, seen.values))
  }, 120_000)
})
