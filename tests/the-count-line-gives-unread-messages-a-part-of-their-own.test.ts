// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DECISIONS PAGE'S COUNT LINE GIVES THE MESSAGES YOU HAVE NOT READ A PART OF THEIR OWN.
 *
 * The count line under the page's heading said "2 asked of you" over a section headed "Asked of you" that counted 1.
 * The second one was a message the person had not read. The server files such a message in the asked tier, and the
 * page draws it in the list "Messages you have not read" beside the sections, not in the asked section. The count
 * line counted it under "asked of you" all the same, so the person read two numbers for one heading. The line now
 * draws the messages in a part of their own, and its "asked of you" part leaves them out. Its total is unchanged:
 * every part is still always drawn, and the parts still add up to it.
 *
 * WHAT IS MEASURED, in a browser on a test office of this file's own (liveApp). An agent the person started asks for
 * a card, which waits in the asked section and sends the person one message:
 *   1. in English, the count line's "asked of you" part says the number on the "Asked of you" section;
 *   2. in English, exactly one part of the count line is none of the three tiers' words, and its number is the number
 *      on the list "Messages you have not read";
 *   3. in English and in Chinese, the count line's parts are the numbers of the page's four places, in any order: the
 *      three tiers' sections (0 where a section is not drawn) and the messages list. They add up to the line's total;
 *   4. at 1440, 990, 660 and 390 wide, in the light and the dark look, in English and in Chinese, the Decisions page is
 *      drawn with nothing wider than the window. A picture of each is kept in the folder TEST_SHOTS names.
 *
 * MUTATION, after a control run: the count line's "asked of you" part counts the messages again, and the part of
 * their own is not drawn (src/web/components/DecisionQueue.tsx). Cases 1, 2 and 3 go red.
 */

import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { governancePath } from '../src/web/components/router.tsx'
import { TIERS } from '../src/web/lib/waiting.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

let app: LiveApp

const shots = testShots('the-count-line-gives-unread-messages-a-part')

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

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<void> {
  const res = await fetch(`${app.api}${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(res.status, `${url}: ${hidden(await res.text())}`).toBeLessThan(300)
}

/** The count line under the page's heading. */
const theCountLine = () => app.page.locator('.gq-head .dq-count')

/** The page's three tier sections and the messages list, by the surface each declares. */
const PLACES = ['decisions.waiting', 'governance.asked', 'governance.aside', 'governance.messages'] as const

/** The number on one place's head, or 0 when the place is not drawn. */
async function theNumberOn(surface: (typeof PLACES)[number]): Promise<number> {
  const count = app.page.locator(`[data-target="uiSurface/${surface}"] .px-panel-actions .dq-count`)
  return (await count.count()) === 0 ? 0 : Number.parseInt(await count.first().innerText(), 10)
}

/** Opens the Decisions page in one language and waits for the count line's total and the messages list. */
async function openTheDecisionsPage(query: string): Promise<void> {
  await app.page.goto(`${app.site}/${query}#${governancePath()}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await theCountLine().locator(':scope > b.num').first().waitFor({ state: 'visible', timeout: 30_000 })
  await app.page.locator('[data-target="uiSurface/governance.messages"]').first().waitFor({ state: 'visible', timeout: 30_000 })
}

/** The count line's total and each part's words and number. */
async function theCountLineRead(): Promise<{ total: number; parts: { said: string; n: number }[] }> {
  const line = theCountLine()
  const total = Number(await line.locator(':scope > b.num').first().innerText())
  const parts: { said: string; n: number }[] = []
  for (const part of await line.locator('.dq-count-part').all()) {
    parts.push({ said: ((await part.textContent()) ?? '').trim(), n: Number(await part.locator('b.num').innerText()) })
  }
  return { total, parts }
}

/** The tier whose word a part says, or null when it says none of the three. */
const theTierSaid = (part: { said: string; n: number }): string | null => TIERS.find((tier) => tier.part(part.n) === part.said)?.tier ?? null

beforeAll(async () => {
  app = await liveApp({ name: 'the-count-line-gives-unread-messages-a-part', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // THE LOOK COMES FROM THE ADDRESS, so each picture names its own and a later load does not inherit it.
  await app.context.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  // AN AGENT THE PERSON STARTED ASKS THE PERSON FOR A CARD. The ask waits in the asked section, and the person is sent a
  // message about it, which waits in the list of messages not read. The agent's key is not kept: it is never needed.
  await post('/api/agents/started', { ...AS_THE_PERSON, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) }, { handle: 'asks-for-a-card', name: 'Asks for a card', role: 'worker', workArea: ['work'] })
  await post('/api/roles/requests', asAgent('asks-for-a-card'), { asking: 'supervisor', because: 'Test: to lead a wave' })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe("the Decisions page's count line, with an ask and a message not read", () => {
  // MUTATION: red.
  it('1. in English, the "asked of you" part says the number on the "Asked of you" section', async () => {
    await openTheDecisionsPage('?lang=en')
    const asked = (await theCountLineRead()).parts.filter((part) => theTierSaid(part) === 'asked')
    expect(asked, 'the count line draws no "asked of you" part, or more than one').toHaveLength(1)
    expect(await theNumberOn('governance.asked'), 'the "Asked of you" section draws no row').toBeGreaterThan(0)
    expect(asked[0]!.n, 'the count line and the section say two numbers for one heading').toBe(await theNumberOn('governance.asked'))
  }, 120_000)

  // MUTATION: red.
  it('2. in English, one part names the messages not read, with the number on their list', async () => {
    await openTheDecisionsPage('?lang=en')
    const others = (await theCountLineRead()).parts.filter((part) => theTierSaid(part) === null)
    expect(await theNumberOn('governance.messages'), 'the list of messages not read is empty').toBeGreaterThan(0)
    expect(others.map((part) => part.said), 'the count line does not give the messages a part of their own').toHaveLength(1)
    expect(others[0]!.n, 'the part and the list say two numbers for the messages').toBe(await theNumberOn('governance.messages'))
  }, 120_000)

  // MUTATION: red.
  for (const lang of ['en', 'zh'] as const) {
    it(`3. in ${lang === 'en' ? 'English' : 'Chinese'}, the parts are the numbers of the page's four places, and add up to the total`, async () => {
      await openTheDecisionsPage(`?lang=${lang}`)
      const line = await theCountLineRead()
      const places: number[] = []
      for (const surface of PLACES) places.push(await theNumberOn(surface))
      const inOrder = (numbers: number[]) => [...numbers].sort((a, b) => a - b)
      expect(inOrder(line.parts.map((part) => part.n)), "the count line's parts are not the page's places").toEqual(inOrder(places))
      expect(line.parts.reduce((sum, part) => sum + part.n, 0), "the count line's parts do not add up to its total").toBe(line.total)
    }, 120_000)
  }

  it('4. the Decisions page is drawn at four widths in both looks, in English and Chinese, with nothing wider than the window', async () => {
    const tooWide: string[] = []
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark'] as const) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: look })
        for (const lang of ['en', 'zh'] as const) {
          await openTheDecisionsPage(`?lang=${lang}&look=${look}`)
          const wide = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          if (wide > 0) tooWide.push(`${lang} at ${String(width)} in the ${look} look, ${String(wide)} px`)
          await app.page.screenshot({ path: join(shots, `decisions-${lang}-${String(width)}-${look}.png`), fullPage: false })
        }
      }
    }
    expect(tooWide, 'the page is wider than the window').toEqual([])
  }, 900_000)
})
