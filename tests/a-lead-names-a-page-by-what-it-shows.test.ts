// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LEAD TO A PAGE NAMES THE PAGE BY WHAT IT SHOWS, NOT BY ITS ADDRESS. Problem 30fVQwjGa3Qb.
 *
 * Wave 13n's round-28 pictures showed the lead offer on a Chinese page saying
 * "Guide P想带你去页面 /pipeline/20-fbBzGORvo。". The kind's word was Chinese, but the place was an
 * address with an id in it, which is not a name a person reads. Now `whereALeadGoes` in
 * src/web/components/Leading.tsx names a page this way:
 *   - an address that names a record: the record's kind word in the page language and its title, read
 *     in the project the lead names. For a pipeline's drawing, the brief's example: 流程 Handover v2 的图;
 *   - any other address: the page's own name, the one the sidebar draws (全部记录 for /records);
 *   - in developer mode, the address as well.
 *
 * WHAT IS PROVED, in a real browser, in English and at ?lang=zh:
 *   1. A lead to the drawing of the pipeline "Handover v2", in another project, reads the kind word and
 *      the title, and neither the address nor the id.
 *   2. A lead to /records reads the page's own name, and not the address.
 *   3. In developer mode, the address is there too.
 *   4. On a Chinese page a space stands where a Chinese character meets a Latin name, as the secretary's review
 *      of round 29 asks: 'Guide P 想带你去 Robotics，流程 Handover v2 的图。'.
 *   6. At 1440 in Chinese the last word stays with what comes before it: 的 and 图 lie on one line
 *      (the secretary's review of wave 13n's round 29, which found 图 alone on the second line).
 *   5. At 390 the offer takes at most two lines, project first, and nothing of it is hidden or cut off.
 *      The English sentence wraps to two lines; the Chinese one fits on one. Before, the offer was one
 *      line cut with an ellipsis, so the title was cut off.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   whereALeadGoes names every non-record target by nameTarget again   → cases 1 and 2, both languages
 *   the address is not drawn in developer mode                         → case 3
 *   the offer is one line again at 390 (px-lead-one-line)              → case 5, in English
 *   the offer's words break between Chinese characters again (no keep-all) → case 6
 *   leadSentence joins a name with no gap instead of asking gapBetween   → case 4, and every zh case
 *
 * PICTURES. When LEAD_PLACE_SHOTS names a folder, the offer is photographed at 1440, 990, 660 and 390
 * in light and dark, and at 1440 and 390 in Chinese. A run that is not asked for pictures takes none.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'

let app: LiveApp
/** The pipeline whose drawing the guide offers to take the owner to. It is in the OTHER project. */
let pipelineThere = ''

const OTHER = 'robotics'
const OTHER_TITLE = 'Robotics'
const GUIDE = 'Guide P'
const PIPELINE_TITLE = 'Handover v2'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_GUIDE = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'guide-p' }
const IN_THE_OTHER_PROJECT = { ...AS_THE_OWNER, 'x-mole-office-workspace': OTHER }

/** One word of a list, with its values filled in the way t() fills them. */
function fill(word: string, values: Record<string, string>): string {
  return word.replace(/\{(\w+)\}/g, (mark, name: string) => values[name] ?? mark)
}

async function write(headers: Record<string, string>, body: unknown): Promise<string> {
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  const made = (await res.json()) as { record?: { id: string } }
  expect(res.status, JSON.stringify(made)).toBe(201)
  return made.record?.id ?? ''
}

/** Every offer waiting for the owner marked read, so the next case draws only its own. */
async function answerEveryOffer(): Promise<void> {
  const res = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
  const held = (await res.json()) as { messages: { id: string; deliveries: { to: { kind: string }; mark: string }[] }[] }
  for (const one of held.messages) {
    if (one.deliveries.some((d) => d.to.kind === 'person' && d.mark !== 'seen')) {
      const marked = await fetch(`${app.api}/api/messages/${one.id}/mark`, {
        method: 'POST',
        headers: AS_THE_OWNER,
        body: JSON.stringify({ mark: 'seen' }),
      })
      expect(marked.status, await marked.text()).toBeLessThan(300)
    }
  }
}

/** The guide offers to take the owner to one page. Written in `default`. */
async function leadTo(target: Record<string, string>): Promise<void> {
  await answerEveryOffer()
  await write(AS_THE_GUIDE, {
    kind: 'message',
    title: 'Come and look',
    data: { body: 'Come and look at this.', to: [{ kind: 'person', id: THE_PERSON }], lead: { target } },
  })
}

/** Open the records page in `default`, in one language and mode, and wait for the offer. */
async function openAt(query: string): Promise<void> {
  await app.page.goto(`${app.site}/?${query}#/records`, { timeout: 60_000 })
  await app.page.evaluate(() => window.localStorage.setItem('mole-office.workspace', 'default'))
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.px-lead-offer', { timeout: 30_000 })
}

const wordsOfTheOffer = (): Promise<string> =>
  app.page.$eval('.px-lead-offer .px-lead-words', (el) => el.textContent ?? '')

/**
 * A CHINESE SENTENCE AS THE OFFER DRAWS IT: a space where a Chinese character meets a Latin letter or
 * a digit. The names in these cases are all Latin, so this matches the offer's rule, which spaces only
 * the edges of a name. An English sentence has no Chinese character and is unchanged.
 */
function spacedAsDrawn(sentence: string): string {
  return sentence.replace(/(\p{Script=Han})(?=[A-Za-z0-9])/gu, '$1 ').replace(/([A-Za-z0-9])(?=\p{Script=Han})/gu, '$1 ')
}

/** The whole offer for the pipeline's drawing in the other project, from one word list. */
function theDrawingOffer(list: typeof en | typeof zh): string {
  const place = fill(list['leadPlace.drawingOf'], { kind: list['kind.pipeline'], title: PIPELINE_TITLE })
  return spacedAsDrawn(
    fill(list['chatEnglish.lead.offer'], {
      agent: GUIDE,
      where: fill(list['chatEnglish.lead.inAnotherProject'], { where: place, project: OTHER_TITLE }),
    }),
  )
}

/**
 * HOW THE OFFER'S WORDS LIE ON THE SCREEN: how many lines the sentence takes, and whether any of it is
 * hidden below the box or cut off at its side.
 */
const howTheOfferLies = (): Promise<{ lines: number; hiddenBelow: boolean; cutAtTheSide: boolean }> =>
  app.page.$eval('.px-lead-offer .px-lead-words', (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const tops = new Set([...range.getClientRects()].map((one) => Math.round(one.top)))
    return {
      lines: tops.size,
      hiddenBelow: el.scrollHeight > el.clientHeight + 1,
      cutAtTheSide: el.scrollWidth > el.clientWidth + 1,
    }
  })

beforeAll(async () => {
  app = await liveApp({ name: 'lead-names-a-page', viewport: { width: 1440, height: 1000 } })
  const made = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ id: OTHER, title: OTHER_TITLE }),
  })
  expect(made.status, await made.text()).toBe(201)
  await write(AS_THE_OWNER, { kind: 'agent', title: GUIDE, data: { handle: 'guide-p', runtime: 'claude-code', state: 'active' } })
  pipelineThere = await write(IN_THE_OTHER_PROJECT, { kind: 'pipeline', title: PIPELINE_TITLE, data: { blockIds: [] } })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a lead to the drawing of a pipeline names the pipeline, not the address', () => {
  for (const [lang, list] of [
    ['en', en],
    ['zh', zh],
  ] as const) {
    it(`reads the kind word and the title, and no address, in ${lang}`, async () => {
      await leadTo({ kind: 'page', route: `/pipeline/${pipelineThere}`, workspaceId: OTHER })
      await openAt(`lang=${lang}&mode=normal`)
      await expect.poll(wordsOfTheOffer, { timeout: 20_000 }).toBe(theDrawingOffer(list))
      const words = await wordsOfTheOffer()
      expect(words).toContain(list['kind.pipeline'])
      expect(words).toContain(PIPELINE_TITLE)
      expect(words).not.toContain('/pipeline/')
      expect(words).not.toContain(pipelineThere)
    }, 120_000)
  }

})

describe('on a Chinese page a Latin name stands apart from the Chinese around it', () => {
  it(`says the sentence ${THE_TEST_OFFICES_SECRETARY.handle}\u2019s review wrote`, async () => {
    await leadTo({ kind: 'page', route: `/pipeline/${pipelineThere}`, workspaceId: OTHER })
    await openAt('lang=zh&mode=normal')
    await expect.poll(wordsOfTheOffer, { timeout: 20_000 }).toBe('Guide P 想带你去 Robotics，流程 Handover v2 的图。')
  }, 120_000)
})

describe('at 390 the offer takes at most two lines, project first, and hides nothing', () => {
  for (const [lang, list] of [
    ['en', en],
    ['zh', zh],
  ] as const) {
    it(`hides nothing of the offer in ${lang}`, async () => {
      await leadTo({ kind: 'page', route: `/pipeline/${pipelineThere}`, workspaceId: OTHER })
      await app.page.setViewportSize({ width: 390, height: 1000 })
      try {
        await openAt(`lang=${lang}&mode=normal`)
        await expect.poll(wordsOfTheOffer, { timeout: 20_000 }).toBe(theDrawingOffer(list))
        expect((await wordsOfTheOffer()).startsWith(lang === 'en' ? `${GUIDE} wants to take you to ${OTHER_TITLE}` : `${GUIDE} 想带你去 ${OTHER_TITLE}`)).toBe(true)
        const lies = await howTheOfferLies()
        expect(lies.hiddenBelow, 'part of the offer is hidden below its box').toBe(false)
        expect(lies.cutAtTheSide, 'part of the offer is cut off at the side').toBe(false)
        // THE ENGLISH SENTENCE IS LONGER THAN ONE LINE AT 390, so it shows the wrap. The Chinese one is
        // short enough to fit on one line there, which is allowed: the order is at most two lines.
        if (lang === 'en') expect(lies.lines).toBe(2)
        else expect(lies.lines).toBeLessThanOrEqual(2)
      } finally {
        await app.page.setViewportSize({ width: 1440, height: 1000 })
      }
    }, 120_000)
  }
})

describe('at 1440 in Chinese the last word stays with what comes before it', () => {
  it('draws 的 and 图 on one line', async () => {
    await leadTo({ kind: 'page', route: `/pipeline/${pipelineThere}`, workspaceId: OTHER })
    await openAt('lang=zh&mode=normal')
    await expect.poll(wordsOfTheOffer, { timeout: 20_000 }).toBe(theDrawingOffer(zh))
    // THE TOP OF EACH OF THE TWO CHARACTERS, read from the drawn text itself.
    const tops = await app.page.$eval('.px-lead-offer .px-lead-words', (el) => {
      const text = el.firstChild as Text
      const at = (text.textContent ?? '').lastIndexOf('的图')
      const topOf = (from: number): number => {
        const range = document.createRange()
        range.setStart(text, from)
        range.setEnd(text, from + 1)
        return Math.round(range.getBoundingClientRect().top)
      }
      return at < 0 ? null : { de: topOf(at), tu: topOf(at + 1) }
    })
    expect(tops, 'the offer holds no 的图').not.toBeNull()
    expect(tops!.tu, '图 was left alone on a line of its own').toBe(tops!.de)
  }, 120_000)
})

describe('a lead to a page that shows no record names the page', () => {
  for (const [lang, list] of [
    ['en', en],
    ['zh', zh],
  ] as const) {
    // The page's name is read from the lists the pages read, so it may be a wave's word. A name that waits for its
    // Chinese is drawn in its English on a Chinese page, in wave 13j's round 43, and no other.
    it(`reads the page's own name, and no address, in ${lang}`, async () => {
      await leadTo({ kind: 'page', route: '/records' })
      await openAt(`lang=${lang}&mode=normal`)
      await expect
        .poll(wordsOfTheOffer, { timeout: 20_000 })
        .toBe(spacedAsDrawn(fill(list['chatEnglish.lead.offer'], { agent: GUIDE, where: String(theWordAPageDraws(lang, 'nav.records')) })))
      expect(await wordsOfTheOffer()).not.toContain('/records')
    }, 120_000)
  }
})

describe('in developer mode the address is there too', () => {
  for (const [lang, list] of [
    ['en', en],
    ['zh', zh],
  ] as const) {
    it(`draws the name and the address in ${lang}`, async () => {
      await leadTo({ kind: 'page', route: `/pipeline/${pipelineThere}`, workspaceId: OTHER })
      await openAt(`lang=${lang}&mode=inspect`)
      const place = fill(list['leadPlace.drawingOf'], { kind: list['kind.pipeline'], title: PIPELINE_TITLE })
      const withAddress = fill(list['leadPlace.withAddress'], { place, route: `/pipeline/${pipelineThere}` })
      await expect
        .poll(wordsOfTheOffer, { timeout: 20_000 })
        .toBe(
          spacedAsDrawn(
            fill(list['chatEnglish.lead.offer'], {
              agent: GUIDE,
              where: fill(list['chatEnglish.lead.inAnotherProject'], { where: withAddress, project: OTHER_TITLE }),
            }),
          ),
        )
    }, 120_000)
  }
})

describe('the offer is looked at', () => {
  it.skipIf(!process.env['LEAD_PLACE_SHOTS'])(
    'photographs the offer at 1440, 990, 660 and 390 in both themes, and at 1440 in Chinese',
    async () => {
      const shots = process.env['LEAD_PLACE_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })
      await leadTo({ kind: 'page', route: `/pipeline/${pipelineThere}`, workspaceId: OTHER })
      await openAt('lang=en&mode=normal')
      // THE OFFER SAYS WHAT THE PAGE SHOWS before it is photographed, so a picture of the address cannot pass for this.
      await expect.poll(wordsOfTheOffer, { timeout: 20_000 }).toBe(theDrawingOffer(en))
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(150)
          await app.page.waitForSelector('.px-lead-offer', { timeout: 30_000 })
          await app.page.screenshot({ path: `${shots}/lead-place-en-${String(width)}-${theme}.png`, fullPage: false })
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
      await openAt('lang=zh&mode=normal')
      await expect.poll(wordsOfTheOffer, { timeout: 20_000 }).toBe(theDrawingOffer(zh))
      await app.page.screenshot({ path: `${shots}/lead-place-zh-1440-light.png`, fullPage: false })
      // AND IN CHINESE AT 390, light and dark: the round-30 brief asks for the offer at 390 and 1440 in both languages.
      await app.page.setViewportSize({ width: 390, height: 1000 })
      for (const theme of ['light', 'dark'] as const) {
        await app.page.emulateMedia({ colorScheme: theme })
        await app.page.waitForTimeout(150)
        await app.page.waitForSelector('.px-lead-offer', { timeout: 30_000 })
        await app.page.screenshot({ path: `${shots}/lead-place-zh-390-${theme}.png`, fullPage: false })
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.emulateMedia({ colorScheme: 'light' })
    },
    300_000,
  )
})
