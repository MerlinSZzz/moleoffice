// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARCHIVED NOTICE IS DRAWN IN WORDS ON THE MESSAGES PAGE, NEVER AS A TICK. Problem 0WUuvB0IhRfb.
 *
 * The dead-letter sweep marks an office notice to a retired agent archived: nobody read it, and nobody will be woken
 * for it. The Messages page names each recipient with the mark's word, so the row reads "Archived" for that agent,
 * and the page's filter by how far a message got offers "Archived" too.
 *
 * The world: one worker, which the office's own card notice is written to when it is registered. The worker is
 * retired and the sweep is pressed, so that notice is archived. A separate fixture retains the old
 * group sweep shape; new private notices are not used as evidence for legacy group rendering.
 *
 * The retained legacy group line was delivered to nobody, because nobody is named to take the dead letters. The Messages page
 * and the line's own page say so, and do not say it reached everybody in the group.
 *
 * THE LINE'S OWN PAGE (the secretary's review of round 32) says what happened and why, once: the line's few words and
 * its whole sentence (what the sweep did, with the counts), and who the line was sent to and why in one sentence, not
 * twice. In Chinese the page says all of it in Chinese, from the facts the sweep stored, and the Messages page names
 * the line by its Chinese words.
 *
 * When TEST_SHOTS names a folder, the Messages page and the line's own page are photographed at 1440, 990, 660 and
 * 390 in light and dark, in English and in Chinese.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { MESSAGE_SEGMENT } from '../src/shared/addresses.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { createI18n, sayInEnglish } from '../src/shared/i18n.ts'
import type { TheDeadLetterSweepSaid } from '../src/shared/groups.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let db: TestDb
let lineId = ''
let legacyGroupName = ''
const shots = testShots('an-archived-notice-is-drawn-in-words')

async function call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method, headers: AS_THE_PERSON, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status < 300, `${method} ${path}: ${text.slice(0, 400)}`).toBe(true)
  return JSON.parse(text) as Record<string, unknown>
}

async function openTheMessages(lang: 'en' | 'zh' = 'en', width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}#/messages`)
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.px-ms-one', { timeout: 30_000 })
}

let archivedId = ''

beforeAll(async () => {
  db = await freshDb()
  const setup = (await apiApp()).app
  try {
    await setup.ready()
    const inject = async (url: string, payload?: object) => {
      const reply = await setup.inject({ method: 'POST', url, headers: AS_THE_PERSON, ...(payload === undefined ? {} : { payload }) })
      expect(reply.statusCode, reply.body).toBeLessThan(300)
      return reply.json()
    }
    await inject('/api/agents/started', { handle: 'quill', name: 'Quill', role: 'worker' })
    await inject('/api/participants/agent/quill/retire', { because: 'Test: its work here is done.' })
    const swept = await inject('/api/dead-letters/sweep')
    expect(swept.archived).toBe(1)
    archivedId = (db.client.sqlite.prepare("SELECT message_id AS id FROM message_delivery WHERE mark='archived'").get() as { id: string }).id
    const current = db.api.getRecord(swept.lineId)!
    expect(current.data['to']).toEqual([])
    expect(current.data['toGroup']).toBeUndefined()
    const groupReply = await setup.inject({ method: 'GET', url: `/api/groups/${swept.groupId}`, headers: AS_THE_PERSON })
    expect(groupReply.statusCode, groupReply.body).toBe(200)
    legacyGroupName = groupReply.json().group.name
    const legacyFacts = (current.data['deadLetterSweep'] as { said: TheDeadLetterSweepSaid }).said
    expect(legacyFacts.archived).toEqual([{ name: 'quill', count: 1 }])
    // A retained group line predates private sweep notices. Keep its actual stored shape and rendering promise.
    const { notice: _notice, ...legacy } = current.data
    lineId = db.api.createRecord({
      workspaceId: current.workspaceId, kind: 'message', title: current.title, origin: 'fixture',
      data: { ...legacy, toGroup: swept.groupId, deliveredOnlyTo: [] },
      actor: db.api.HUMAN, senderIsMoleOffice: true,
    }).id
  } finally { await setup.close() }
  app = await liveApp({ name: 'an-archived-notice-in-words', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: db.file })
  const restarted = await call('GET', `/api/messages/${lineId}`) as { message: { toGroup: string; deliveries: unknown[] } }
  expect(restarted.message.toGroup).toBeTruthy()
  expect(restarted.message.deliveries).toEqual([])
  await app.page.addInitScript(({ person }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
  }, { person: THE_PERSON })
}, 300_000)

afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)


it('the retained legacy group sweep line says it was delivered to nobody, not that it reached everybody in the group', async () => {
  await openTheMessages()
  const row = app.page.locator('.px-ms-one', { hasText: sayInEnglish('deadLetterSweep.line') }).filter({ hasText: legacyGroupName })
  const said = (await row.locator('.px-ms-went').textContent()) ?? ''
  expect(said).toContain(sayInEnglish('messages.page.toAGroupDeliveredToNobody', { group: legacyGroupName }))
  expect(said).not.toContain('so it reached everybody in it')
  expect(said).not.toContain('none the registries could place')
  await openTheLine()
  const page = (await app.page.locator('main').textContent()) ?? ''
  expect(page).not.toContain('so it reached everybody in it')
}, 120_000)

it('the retained legacy group line\'s own page says what the sweep did, and who the line was sent to and why, once', async () => {
  await openTheLine()
  const page = (await app.page.locator('main').innerText()) ?? ''
  // WHAT HAPPENED: the line's few words and its whole sentence, not only "Dead letters".
  expect((await app.page.locator('.mp-body').innerText()).trim().replace(/\s+/gu, ' ')).toBe([sayInEnglish('deadLetterSweep.line'), sayInEnglish('deadLetterSweep.archived', { n: 1, list: 'quill (1)' })].join(' ').replace(/\s+/gu, ' '))
  // WHO IT WAS SENT TO AND WHY, said once and nowhere else on the page.
  const sentTo = sayInEnglish('deadLetterLines.sentTo.nobody.noSecretary')
  expect((await app.page.locator('.mp-sent-to').innerText()).trim()).toBe(sentTo)
  expect(page.split(sentTo).length - 1, `the page must say its delivery explanation once: ${page}`).toBe(1)
  expect(page).not.toContain('Mole Office delivered it to no member and woke none.')
  expect((await app.page.locator('.mp-to-group').innerText()).trim()).toBe(sayInEnglish('deadLetterLines.toTheGroup', { group: legacyGroupName }))
  // AND THE SAME IN CHINESE, with no English word of the line left.
  await openTheLine('zh')
  const chinese = (await app.page.locator('main').innerText()) ?? ''
  const chineseWords = createI18n('zh').t
  expect((await app.page.locator('.mp-body').innerText()).trim().replace(/\s+/gu, ' ')).toBe([chineseWords('deadLetterSweep.line'), chineseWords('deadLetterSweep.archived', { n: 1, list: 'quill (1)' })].join(' ').replace(/\s+/gu, ' '))
  expect((await app.page.locator('.mp-sent-to').innerText()).trim()).toBe(chineseWords('deadLetterLines.sentTo.nobody.noSecretary'))
  expect(chinese).not.toContain('Dead letters')
  expect(chinese).not.toContain('Archived')
}, 120_000)


async function openTheLine(lang: 'en' | 'zh' = 'en', width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}#/${MESSAGE_SEGMENT}/${encodeURIComponent(lineId)}`)
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.mp-to-group', { timeout: 30_000 })
}

it.skipIf(!process.env['TEST_SHOTS'])('photographs the sweep line\'s own page', async () => {
  for (const lang of ['en', 'zh'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark']) {
        await openTheLine(lang, width, look)
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${lang} ${String(width)} ${look}`).toBe(true)
        await app.page.screenshot({ path: `${shots}/sweep-line-page-${lang}-${String(width)}-${look}.png`, fullPage: true })
      }
    }
  }
}, 600_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the Messages page with the archived notice', async () => {
  for (const lang of ['en', 'zh'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark']) {
        await openTheMessages(lang, width, look)
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${lang} ${String(width)} ${look}`).toBe(true)
        if (lang === 'zh') expect(await app.page.locator('.px-ms-mark').allTextContents()).toContain('已归档')
        await app.page.screenshot({ path: `${shots}/archived-messages-${lang}-${String(width)}-${look}.png`, fullPage: false })
      }
    }
  }
}, 600_000)
