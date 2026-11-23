// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ADMISSION SAYS ONE WORD ON HOME AND ON THE PAGE ITS ROW OPENS.
 *
 * A session that registered itself while the window was closed waits for one press, and that press admits it and
 * gives it the card it asked for. Home's row for it said "Give card", and the ask's own page, which the row opens,
 * names the press "Admit it". The person read two words for one press. The waiting reading now files the admission
 * under an act of its own, `admit-agent`, as the "Waiting on you" door already did, and the row says the press's word.
 *
 * WHAT IS MEASURED, in a browser on a test office of this file's own (liveApp):
 *   3. the Decisions badge in the rail counts the admission;
 *   4. at 1440 and 390 wide, in the light look, Home and the ask's page are drawn with nothing
 *      wider than the window. A picture of each is kept in the folder TEST_SHOTS names.
 *
 * THE TWO OTHER ASKS AT THE DOOR said two words for one press as well. An agent's ask for a card was "Give card" on its
 * row and "Give the card" on its press, and an agent's ask for a new key was "Give key" on its row and "Give a new key"
 * on its press. Each row now says its press's word. They are made after case 3, so the badge there counts the
 * admission alone.
 *   9. at 1440 and 390 wide, in the light look, Home, the Decisions page and the Office page in English and Chinese, and
 *      the two asks' pages in English, are drawn with nothing wider than the window. Home, the Decisions page and the
 *      Office page draw the row's word; the asks' pages draw the press's.
 *
 * EACH PAGE IS OPENED ONCE FOR EACH LANGUAGE AND LOOK, in cases 4 and 9. It is opened at 1440 and the window is then
 * resized to 390, rather than the page being opened again at each width. An open that changes only the
 * address's hash is not a new load, and the second of two pages under the same address is opened that way, as before.
 * Before this was changed, every reading was taken both ways, after an open at the width and after a resize to it; the
 * two were the same in each.
 *
 * MUTATIONS, each after a control run:
 *   2. `railCount` leaves `admit-agent` out (src/web/lib/waiting.ts): case 3 goes red.
 */

import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { HomePart } from '../src/shared/home-layout.ts'
import { categoryPath, governancePath } from '../src/web/components/router.tsx'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { liveApp, thePersonsKeyHeader, theResizeIsDrawn, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

let app: LiveApp
let request = ''
/** The Decisions badge before the session registered itself: 0 when no badge is drawn. */
let badgeBefore = 0

const shots = testShots('an-admission-says-one-word')

async function open(path: string, query: string): Promise<void> {
  await app.page.goto(`${app.site}/${query}#${path}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
}

/** Home's link for one waiting item. */
const homeLink = (id: string) => app.page.locator(`[data-home-section="needs"] a.hm-needs-link[data-home-waiting-id="${id}"]`)

/** Home's Needs you, which Home draws whichever rows it holds, by its part's name in the layout. */
const NEEDS: HomePart = 'needs'
const homeNeeds = () => app.page.locator(`[data-home-section="${NEEDS}"]`).first()

/** The first press on the ask's page: the one that answers the ask. */
const thePress = () => app.page.locator('.tc-ask .tc-acts button').first()

/** The number on the Decisions badge, or 0 when none is drawn. */
async function theDecisionsBadge(): Promise<number> {
  const badge = app.page.locator(`a.shell-link[href="#${governancePath()}"] .shell-badge`)
  return (await badge.count()) === 0 ? 0 : Number(await badge.first().innerText())
}

beforeAll(async () => {
  app = await liveApp({ name: 'an-admission-says-one-word', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // THE LOOK COMES FROM THE ADDRESS, so each picture names its own and a later load does not inherit it.
  await app.context.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  await open('/', '?lang=en')
  await app.page.locator('[data-home-section="needs"]').first().waitFor({ state: 'visible', timeout: 30_000 })
  badgeBefore = await theDecisionsBadge()
  const res = await fetch(`${app.api}/api/agents/register-myself`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'newcomer' },
    body: JSON.stringify({ handle: 'newcomer', name: 'Newcomer', workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`, requestedRole: 'worker' }),
  })
  const said = (await res.text()).replace(/[0-9a-f]{64}/g, '<a key>')
  expect(res.status, said).toBe(202)
  request = String((JSON.parse(said) as { request: string }).request)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a session that registered itself and waits for the press that admits it', () => {
  // MUTATION 2: red.
  it('3. the Decisions badge in the rail counts the admission', async () => {
    await open('/', '?lang=en')
    await homeLink(request).waitFor({ state: 'visible', timeout: 30_000 })
    await expect.poll(theDecisionsBadge, { timeout: 20_000, message: 'the Decisions badge does not count the admission' }).toBe(badgeBefore + 1)
  }, 120_000)

  it('4. Home and the ask’s page are drawn at 1440 and 390 in the light look with nothing wider than the window', async () => {
    const tooWide: string[] = []
    {
      const look = 'light' as const
      await app.page.emulateMedia({ colorScheme: look })
      for (const [name, path, shown] of [
        ['home', '/', homeLink(request)],
        ['ask', `/r/${request}`, thePress()],
      ] as const) {
        // EACH PAGE IS OPENED ONCE FOR EACH LOOK, at 1440; the window is then resized to each of the other widths.
        await app.page.setViewportSize({ width: 1440, height: 1000 })
        await open(path, `?lang=en&look=${look}`)
        for (const width of [1440, 390]) {
          await app.page.setViewportSize({ width, height: 1000 })
          await theResizeIsDrawn(app.page)
          await shown.waitFor({ state: 'visible', timeout: 30_000 })
          await shown.scrollIntoViewIfNeeded()
          const wide = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          if (wide > 0) tooWide.push(`${name} at ${String(width)} in the ${look} look, ${String(wide)} px`)
          await app.page.screenshot({ path: join(shots, `${name}-${String(width)}-${look}.png`), fullPage: false })
        }
      }
    }
    expect(tooWide, 'a page is wider than the window').toEqual([])
  }, 600_000)
})

/** The person's headers, and an agent's in the person's workspace. */
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

/** Every key in a reply replaced, so no failure message carries one. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a key>')

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  expect(res.status, `${url}: ${hidden(text)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, unknown>
}

describe('an ask for a card and an ask for a new key', () => {
  let cardAsk = ''
  let newKeyAsk = ''

  beforeAll(async () => {
    // CASE 4 LEFT THE WINDOW NARROW. The page is put back at 1440 and in the light look.
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ colorScheme: 'light' })
    const key = thePersonsKeyHeader(join(app.dir, 'keys.json'))
    // AN AGENT THE PERSON STARTED ASKS THE PERSON FOR A CARD. Its key is not kept: it is never needed here.
    await post('/api/agents/started', { ...AS_THE_PERSON, ...key }, { handle: 'asks-for-a-card', name: 'Asks for a card', role: 'worker', workArea: ['work'] })
    const asked = await post('/api/roles/requests', asAgent('asks-for-a-card'), { asking: 'supervisor', because: 'Test: to lead a wave' })
    cardAsk = String(asked['request'])
    // AN AGENT THE PERSON STARTED lost its key, and asks at the door for a new one with none.
    await post('/api/agents/started', { ...AS_THE_PERSON, ...key }, { handle: 'lost-its-key', name: 'Lost its key' })
    const res = await fetch(`${app.api}/api/agents/register-myself`, {
      method: 'POST',
      headers: asAgent('lost-its-key'),
      body: JSON.stringify({ handle: 'lost-its-key', name: 'Lost its key', workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`, requestedRole: 'worker', newKey: true }),
    })
    const said = hidden(await res.text())
    expect(res.status, said).toBe(202)
    newKeyAsk = String((JSON.parse(said) as { request: string }).request)
  }, 300_000)

  for (const [n, ask, which] of [[5, 'card', 'an ask for a card'], [7, 'new key', 'an ask for a new key']] as const) {
    const id = (): string => (ask === 'card' ? cardAsk : newKeyAsk)

  }

  it('9. Home, the Decisions page, the Office page and both asks’ pages are drawn at 1440 and 390 in the light look with nothing wider than the window', async () => {
    const tooWide: string[] = []
    const pages = [
      // HOME DRAWS ONLY THE FIRST TWO ROWS OF NEEDS YOU, and the card ask may be past them, so Home is drawn when
      // Needs you is.
      ['home', '/', homeNeeds, ['en', 'zh']],
      ['decisions', governancePath(), () => app.page.locator('.gq-act').first(), ['en', 'zh']],
      ['office', categoryPath('office'), () => app.page.locator(`.px-category-needs-row[href="#/r/${cardAsk}"]`), ['en', 'zh']],
      ['card-ask', `/r/${cardAsk}`, thePress, ['en']],
      ['new-key-ask', `/r/${newKeyAsk}`, thePress, ['en']],
    ] as const
    {
      const look = 'light' as const
      await app.page.emulateMedia({ colorScheme: look })
      for (const [name, path, shown, languages] of pages) {
        for (const lang of languages) {
          // EACH PAGE IS OPENED ONCE FOR EACH LANGUAGE AND LOOK, at 1440; the window is then resized to each of the others.
          await app.page.setViewportSize({ width: 1440, height: 1000 })
          await open(path, `?lang=${lang}&look=${look}`)
          for (const width of [1440, 390]) {
            await app.page.setViewportSize({ width, height: 1000 })
            await theResizeIsDrawn(app.page)
            await shown().waitFor({ state: 'visible', timeout: 30_000 })
            await shown().scrollIntoViewIfNeeded()
            const wide = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
            if (wide > 0) tooWide.push(`${name} in ${lang} at ${String(width)} in the ${look} look, ${String(wide)} px`)
            await app.page.screenshot({ path: join(shots, `${name}-${lang}-${String(width)}-${look}.png`), fullPage: false })
          }
        }
      }
    }
    expect(tooWide, 'a page is wider than the window').toEqual([])
  }, 900_000)
})
