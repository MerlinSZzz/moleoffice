// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE REVIEW OF ROUND 34'S PICTURES FOUND, in wave 13q's own files (wave 13q's round 35; report 4-R71_FDwFHJ,
 * block b-argus-review). In a real browser, on a scratch office holding made-up records:
 *   1. a decision that fills all five fields draws each one's single name, filled, in the band, and four of them in the
 *      fold, where words added later have no section (wave 13k's record page);
 *   2. the sidebar's badge says its count with its measure word in Chinese, 1 项, and a bare 1 in English; the case now
 *      reads the measure word in the badge's title, and the badge itself is a bare 1 in both (the comment at the case);
 *
 * MUTATIONS, each after a control run and a build, are listed in the change's commit message.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'
import { governancePath } from '../src/web/components/router.tsx'

let app: LiveApp
let fullId = ''
let pausedAt = ''
const AS = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const KEEPER = { ...AS, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'test-kite-keeper' }
/** The sidebar's row for the Decisions page, by the address the router gives it. */
const ROW = `a.shell-link[href="#${governancePath()}"]`
const PAUSE = 'A made-up pause: Morgan Vale is mending the line.'

/** The five fields the review asked to see filled, with the one name each has, in English and in Chinese. */
const FIVE: readonly { key: string; en: string; zh: string }[] = [
  { key: 'decided_by', en: 'Decided by', zh: '决定者' },
  { key: 'alternatives_rejected', en: 'Alternatives rejected', zh: '未采纳的方案' },
  { key: 'words_since', en: 'Words added later', zh: '后续补充' },
  { key: 'authority_reference', en: 'Source of authority', zh: '授权依据的来源' },
  { key: 'authority', en: 'Authority', zh: '授权依据' },
]

async function post(path: string, body: unknown, headers: Record<string, string> = AS): Promise<{ record: { id: string } }> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${path} ${text}`).toBeLessThan(300)
  return JSON.parse(text) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'r35-review-of-34', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await post('/api/agents/started', { handle: 'test-kite-keeper', name: 'Test kite keeper' })
  await post('/api/agents/started', { handle: 'test-kite-secretary', name: 'Test kite secretary', role: 'secretary' })
  const key = JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { person: string }
  await post('/api/roles/elevation/test-kite-secretary', { reason: 'Test: a made-up raise', endsWhen: 'when you say' }, { ...AS, 'x-mole-office-key': key.person })
  // A DECISION THE FULL ONE DERIVES FROM, named as its source of authority.
  const earlier = (await post('/api/records', { kind: 'decision', title: 'Test: the kite flies on calm days', data: { option_taken: 'Test: calm days only', because: 'A made-up reason.', ...governsTheWholeProject(), replaces: [] } })).record.id
  // A DECISION THAT FILLS ALL FIVE FIELDS, and leaves `replaces` an empty list.
  fullId = (await post('/api/records', {
    kind: 'decision',
    title: 'Test: mend the tail with tape',
    data: {
      option_taken: 'Test: tape',
      because: 'A made-up reason.',
      decided_by: 'the owner',
      alternatives_rejected: ['Test: glue', 'Test: a new tail'],
      words_since: [{ at: '2026-10-04 21:00:00', words: 'Made-up words added later: the tape held.' }],
      authority: 'an existing decision',
      authority_reference: earlier,
      ...governsTheWholeProject(), replaces: [],
    },
  })).record.id
  // ONE QUESTION WAITING ON THE PERSON, so the Decisions row of the sidebar has a badge of 1.
  await post('/api/records', { kind: 'proposal', title: 'Test which glue for the spar', data: { question: 'Which glue should mend the spar?', options: ['a — wood glue', 'b — epoxy'], recommendation: 'Take (b).', because: 'A made-up reason.', who_settles_it: 'the owner' } }, KEEPER)
  // A PAUSED COUNTER.
  const paused = (await post('/api/counters', { title: 'Test kite launches', counts: 'Launches of the test kite.', mayAdd: { anyone: false, who: [{ kind: 'agent', id: 'test-kite-keeper' }] }, triggers: [{ kind: 'every', hours: 552 }], action: { kind: 'task', title: 'Test look at the launches' } }, KEEPER)) as unknown as { counter: { id: string } }
  const said = (await post(`/api/counters/${encodeURIComponent(paused.counter.id)}/pause`, { because: PAUSE }, KEEPER)) as unknown as { counter: { paused: { at: string } } }
  pausedAt = said.counter.paused.at
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

async function open(language: 'en' | 'zh', address: string, ready: string, clock?: number): Promise<Page> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => localStorage.setItem('mole-office.preset.theme', 'light'))
  if (clock !== undefined) await context.clock.setFixedTime(clock)
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=${language}#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(ready).first().waitFor({ timeout: 30_000 })
  return page
}
const text = async (page: Page, selector: string) => ((await page.locator(selector).first().innerText()) ?? '').replace(/\s+/g, ' ').trim()
const all = async (page: Page, selector: string) => (await page.locator(selector).allInnerTexts()).map((one) => one.replace(/\s+/g, ' ').trim())

it('1 and 8h. a decision that fills all five fields draws each name filled in the band and in the fold, and an empty list grey', async () => {
  for (const language of ['en', 'zh'] as const) {
    const page = await open(language, `/r/${fullId}`, '.px-gov-half-field')
    const filled = await all(page, '.px-gov-half-field:not(.px-gov-half-missing)')
    const grey = await all(page, '.px-gov-half-missing')
    for (const one of FIVE) {
      expect.soft(filled, `${language}: ${one.key} is drawn filled in the band`).toContain(one[language])
      expect.soft(grey, `${language}: ${one.key} is not drawn grey`).not.toContain(one[language])
    }
    const replaces = language === 'en' ? en['record.section.replaces'] : zh['record.section.replaces']
    expect.soft(grey, `${language}: an empty replaces list is a grey name`).toContain(replaces)
    expect.soft(filled, `${language}: an empty replaces list is not a filled name`).not.toContain(replaces)
    // THE FOLD IS THE BODY'S OWN SECTIONS, each a `details` named by its summary; the band's names are not in it.
    // `words_since` is not asked for here: the record page draws no fold section for a list of {at, words}
    // (src/shared/sections.ts drawableAsWords), and that page is wave 13k's, so round 35's report lists it.
    const fold = (await all(page, 'main details > summary')).join(' | ')
    for (const one of FIVE.filter((f) => f.key !== 'words_since')) expect.soft(fold, `${language}: the fold names ${one.key}`).toContain(one[language])
    await page.context().close()
  }
}, 120_000)

/**
 * THE BADGE IS THE BARE NUMBER IN CHINESE AS IN ENGLISH, AND ITS TITLE SAYS THE MEASURE WORD. The badge stands on the
 * icon's corner, and in Chinese a count of two digits with its measure word ("12 项") is wider than that room, so it
 * covered the icon it counts (tests/the-narrowed-sidebar-in-every-theme.test.ts). So the badge now draws the number
 * alone, and the measure word stays where the count is said in full: the badge's title, which is also what a screen
 * reader is given. This case still checks that the measure word is there in Chinese, in the title.
 */
it('2. the sidebar badge is a bare number in Chinese and in English, and its title says the measure word in Chinese', async () => {
  const badge = (page: Page) => page.locator(`${ROW} .shell-badge`).first()
  const zhPage = await open('zh', '/', `${ROW} .shell-badge`)
  expect((await badge(zhPage).innerText()).trim()).toBe('1')
  expect(await badge(zhPage).getAttribute('title'), 'the Chinese title says the count with its measure word').toContain('1 项')
  await zhPage.context().close()
  const enPage = await open('en', '/', `${ROW} .shell-badge`)
  expect((await badge(enPage).innerText()).trim()).toBe('1')
  await enPage.context().close()
}, 120_000)
