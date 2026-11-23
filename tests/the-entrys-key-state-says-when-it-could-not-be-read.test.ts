// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS ENTRY SAYS WHEN THIS COMPUTER'S KEY STATE COULD NOT BE READ, and draws no state word then.
 *
 * The entry draws one of three states of this computer's agent key under its press: none yet, held, or refused. When it
 * cannot read the state, it draws no state, and says in one sentence that the state could not be read, with the
 * reason. Before this, the entry caught the failed read and drew nothing, so a reader could not tell a failed read
 * from an entry with nothing to say.
 *
 * WHAT IS REAL: a throwaway office made by tests/helpers.ts, opened in Normal mode at the entry's own address. One read
 * is answered by the browser instead of the office: the state door, GET /api/office/install-the-entry/this-computers-key,
 * answers 500 with a reason this file makes up. The made-up answer keeps the headers of the office's own answer, because
 * the page refuses a reply that does not name the office it came from, and would then never see the 500.
 *
 * The sentence and the three state words are read by t(), in English and in Chinese.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'

import { THE_ENTRYS_KEY_WORDS } from '../src/shared/entry.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

/** The state door's path, the one read this file fails. */
const THE_STATE_DOOR = '/api/office/install-the-entry/this-computers-key'

/** The reason the made-up failure gives. It is this file's, and no office said it. */
const THE_MADE_UP_REASON = 'The state door failed in this test, on purpose.'

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'entry-key-state-not-read', viewport: { width: 1440, height: 900 } })
  await app.page.route(
    (url) => url.pathname === THE_STATE_DOOR,
    async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const answer = await route.fetch()
      const headers = answer.headers()
      delete headers['content-length']
      await route.fulfill({ status: 500, headers, contentType: 'application/json', body: JSON.stringify({ error: THE_MADE_UP_REASON }) })
    },
  )
}, 120_000)

afterAll(async () => {
  await app?.stop()
})

for (const language of ['en', 'zh'] as const) {
  it(`says in ${language} that the key state could not be read, with the reason, and draws no state word`, async () => {
    const { t } = createI18n(language)
    await app.page.goto(`${app.site}/?lang=${language}&mode=normal#/settings/entry`)
    await waitForThePage(app.page, 30_000)
    const section = app.page.locator('.set [data-settings-panel="settings.entry"]')
    await section.waitFor()
    const sentence = t('settingsPanel.entry.key.unread', { reason: THE_MADE_UP_REASON })
    const said = section.locator('.ite-stack .ite-said', { hasText: sentence })
    await said.waitFor({ timeout: 30_000 })
    expect((await said.innerText()).trim()).toBe(sentence)
    expect(await section.locator('[data-entry-key]').count(), 'a state word is drawn beside the failed read').toBe(0)
    const drawn = await section.locator('.ite-stack').innerText()
    for (const word of Object.values(THE_ENTRYS_KEY_WORDS)) {
      expect(drawn, `the state word ${word} is drawn after a failed read`).not.toContain(t(word))
    }
  }, 120_000)
}
