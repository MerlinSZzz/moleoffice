// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLAG CHOSEN WHILE WRITING SHOWS IN THE BOX, AND THE CURSOR STAYS THERE.
 *
 * The person selects words in the writing box and chooses a flag on the press left of Send. The words they chose are
 * drawn in the flag's words colour with the flag's own colour beneath them, every other character looks as it did,
 * and the box keeps its cursor: after the choice the person goes on typing where they were.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office, in the chat window and on the chat page, at 1440
 * wide in the light theme. The person acts as a person does: real keys in the box, real clicks on the press and on the
 * menu's line.
 *   1. WORDS SELECTED, THEN A FLAG. The marked run in the box takes the flag's words colour as its colour and the
 *      flag's own colour as its underline colour, each compared with the colour the page's own label colour sheet
 *      gives that name, read in the page. The paint layer's own background, and every character it does not mark, are
 *      transparent, so the box's cursor and selection beneath are not covered. The box is the focused element, with
 *      the cursor at the end of the marked words; a letter typed then lands just after them, and the run keeps its
 *      flag.
 *   2. NOTHING SELECTED, THEN A FLAG. The press shows the flag. The box is the focused element, with the cursor where
 *      it was before the press, and a letter typed then lands there.
 *
 * WHAT IT FAILS ON: a paint layer drawn with the box's own background or ink over the box; an underline that is not in
 * the flag's colour; and a choice in the menu that leaves the focus on the press, or moves the box's cursor.
 *
 * The words are read from the word lists, never copied. Everything here is made up: the agent, its one line and the
 * person's flags. The servers come from `liveApp` in tests/helpers.ts, on a database in its own temporary folder.
 */

import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13n } from '../src/shared/words/en-wave-13n.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Two flags in different colours, each with words in a colour of their own. */
const SETTINGS = {
  'just-ask': { colour: 'purple', wordsColour: 'green' },
  'proposal-first': { colour: 'amber', wordsColour: 'red' },
}

/** A word from a word list by its key; a word that is not there is said at once rather than compared as nothing. */
function theWord(list: Readonly<Record<string, unknown>>, key: string): string {
  const word = list[key]
  if (typeof word !== 'string' || word === '') throw new Error(`the word list has no word for ${key}`)
  return word
}
const JUST_ASK = theWord(enWave13n, 'message.intent.name.justAsk')
const JUST_ASK_SHORT = theWord(enWave13y, 'chat.intent.short.justAsk')

const SENTENCE = 'Please mark these words and leave the rest alone.'
const MARKED = 'these words'
const MARKED_FROM = SENTENCE.indexOf(MARKED)
const MARKED_TO = MARKED_FROM + MARKED.length
/** Where the cursor is put, with nothing selected, for the second case: just before "leave". */
const CURSOR_AT = SENTENCE.indexOf('leave')

type Where = 'window' | 'page'
const PLACES: readonly Where[] = ['window', 'page']
/** The chat the case is in: the corner window over Home, or the chat page. */
const theChat = (where: Where): string => `.px-chat[data-where="${where === 'window' ? 'corner' : 'page'}"]`

let app: LiveApp
let agentId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'flag-in-the-box', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const changed = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, {
    method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ shippedFlags: SETTINGS }),
  })
  expect(changed.status, await changed.clone().text()).toBe(200)
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Marker', data: { handle: 'made-up-marker', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-marker')?.id ?? ''
  expect(agentId, 'made-up-marker has no registry row').not.toBe('')
  const line = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-marker' },
    body: JSON.stringify({ kind: 'message', title: 'Ready', data: { body: 'Made-up line: ready when you are.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(line.status, await line.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** A browser window of its own at 1440 in the light theme, open at the made-up agent in the corner window or on the chat page. */
async function aWindow(where: Where): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
  await context.addInitScript((open) => {
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', open)
  }, where === 'window' ? 'yes' : 'no')
  const page = await context.newPage()
  const chat = theChat(where)
  if (where === 'window') {
    await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
  } else {
    await page.goto(`${app.site}/?lang=en#/chat`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator(`${chat} .px-chat-contact:has(.px-chat-name:text-is("Made-up Marker"))`).click()
  }
  await page.waitForSelector(`${chat} .px-chat-write textarea`, { timeout: 30_000 })
  return { context, page }
}

/** Click into the box and type the sentence, as a person does. The cursor is then at its end. */
async function typeTheSentence(page: Page, chat: string): Promise<void> {
  await page.locator(`${chat} .px-chat-write textarea`).click()
  await page.keyboard.type(SENTENCE)
  expect(await page.locator(`${chat} .px-chat-write textarea`).inputValue()).toBe(SENTENCE)
}

async function pressTimes(page: Page, key: string, times: number): Promise<void> {
  for (let n = 0; n < times; n += 1) await page.keyboard.press(key)
}

/** Which element has the focus, and where the box's cursor and selection stand. */
async function theBoxNow(page: Page, chat: string): Promise<{ focused: boolean; start: number; end: number }> {
  return page.locator(`${chat} .px-chat-write textarea`).evaluate((el) => {
    const box = el as HTMLTextAreaElement
    return { focused: document.activeElement === box, start: box.selectionStart, end: box.selectionEnd }
  })
}

/** A real click on the press, and a real click on the menu's line for this flag. */
async function chooseTheFlag(page: Page, chat: string, name: string): Promise<void> {
  await page.locator(`${chat} .px-chat-write .px-chat-intent`).click()
  await page.locator('.px-menu .px-menu-item', { hasText: name }).click()
  await page.waitForSelector('.px-menu', { state: 'detached', timeout: 10_000 })
}

/** The marked runs drawn in the writing box, in order: their words and the colour names they carry. */
async function theMarksInTheBox(page: Page, chat: string): Promise<{ words: string; wordsColour: string | null; flagColour: string | null }[]> {
  return page.$$eval(`${chat} .px-chat-mark-paint .px-chat-marked`, (spans) => spans.map((span) => ({
    words: span.textContent ?? '',
    wordsColour: span.getAttribute('data-words-colour'),
    flagColour: span.getAttribute('data-flag-colour'),
  })))
}

/**
 * THE COLOURS THE PAGE'S OWN LABEL COLOUR SHEET GIVES TWO NAMES, read in the page and never typed here. A probe in the
 * writing row wears the sheet's class and the name, and is drawn in the colour the sheet sets; the row's own ink is
 * read beside them, so a name the sheet does not know is not mistaken for a colour.
 */
async function theSheetsColours(page: Page, chat: string, flagColour: string, wordsColour: string): Promise<{ flag: string; words: string; row: string }> {
  return page.locator(`${chat} .px-chat-write`).evaluate((write, [flag, words]) => {
    const probe = (attribute: string, value: string, property: string): string => {
      const one = document.createElement('span')
      one.className = 'px-label-ink'
      one.setAttribute(attribute, value)
      one.style.color = `var(${property})`
      one.style.position = 'absolute'
      one.style.visibility = 'hidden'
      write.append(one)
      const colour = getComputedStyle(one).color
      one.remove()
      return colour
    }
    return {
      flag: probe('data-colour', flag as string, '--label-ink'),
      words: probe('data-words-colour', words as string, '--label-words'),
      row: getComputedStyle(write).color,
    }
  }, [flagColour, wordsColour] as const)
}

/** How the paint layer over the box is drawn: its own background, its marked runs and the characters it does not mark. */
async function thePaint(page: Page, chat: string): Promise<{
  background: string
  marked: { words: string; colour: string; underline: string; underlineColour: string }[]
  unmarked: { words: string; colour: string }[]
} | null> {
  return page.evaluate((within) => {
    const paint = document.querySelector(`${within} .px-chat-mark-paint`)
    if (paint === null) return null
    const runs = [...paint.children]
    return {
      background: getComputedStyle(paint).backgroundColor,
      marked: runs.filter((one) => one.classList.contains('px-chat-marked')).map((one) => ({
        words: one.textContent ?? '',
        colour: getComputedStyle(one).color,
        underline: getComputedStyle(one).textDecorationLine,
        underlineColour: getComputedStyle(one).textDecorationColor,
      })),
      unmarked: runs.filter((one) => !one.classList.contains('px-chat-marked')).map((one) => ({
        words: one.textContent ?? '',
        colour: getComputedStyle(one).color,
      })),
    }
  }, chat)
}

const CLEAR = 'rgba(0, 0, 0, 0)'

describe('a flag chosen while writing', () => {
  for (const where of PLACES) {
    it(`(1, ${where}) colours the selected words in the flag's colours, covers nothing, and leaves the cursor after them`, async () => {
      const { context, page } = await aWindow(where)
      const chat = theChat(where)
      try {
        await typeTheSentence(page, chat)
        // SELECT THE WORDS WITH THE KEYS, from the end of the sentence back to them.
        await pressTimes(page, 'ArrowLeft', SENTENCE.length - MARKED_TO)
        await pressTimes(page, 'Shift+ArrowLeft', MARKED.length)
        expect(await theBoxNow(page, chat), 'the keys did not select the words this case marks').toEqual({ focused: true, start: MARKED_FROM, end: MARKED_TO })

        await chooseTheFlag(page, chat, JUST_ASK)

        expect(await theMarksInTheBox(page, chat)).toEqual([{ words: MARKED, wordsColour: 'green', flagColour: 'purple' }])
        const sheet = await theSheetsColours(page, chat, 'purple', 'green')
        expect(sheet.flag, 'the sheet gives the flag colour and the words colour the same colour').not.toBe(sheet.words)
        expect(sheet.flag, 'the sheet gives no colour for the flag colour').not.toBe(sheet.row)
        expect(sheet.words, 'the sheet gives no colour for the words colour').not.toBe(sheet.row)

        const paint = await thePaint(page, chat)
        expect(paint, 'nothing is painted over the box').not.toBe(null)
        expect(paint?.marked).toEqual([{ words: MARKED, colour: sheet.words, underline: 'underline', underlineColour: sheet.flag }])
        expect(paint?.background, 'the paint layer has a background of its own, over the box').toBe(CLEAR)
        expect(paint?.unmarked.map((one) => one.words)).toEqual([SENTENCE.slice(0, MARKED_FROM), SENTENCE.slice(MARKED_TO)])
        for (const run of paint?.unmarked ?? []) expect(run.colour, `the paint draws "${run.words}", which nobody marked`).toBe(CLEAR)

        expect(await theBoxNow(page, chat), 'the box does not have the focus, with the cursor after the marked words').toEqual({ focused: true, start: MARKED_TO, end: MARKED_TO })
        await page.keyboard.type('X')
        expect(await page.locator(`${chat} .px-chat-write textarea`).inputValue()).toBe(`${SENTENCE.slice(0, MARKED_TO)}X${SENTENCE.slice(MARKED_TO)}`)
        expect(await theMarksInTheBox(page, chat)).toEqual([{ words: MARKED, wordsColour: 'green', flagColour: 'purple' }])
      } finally {
        await context.close()
      }
    }, 180_000)

    it(`(2, ${where}) with nothing selected, shows the flag on the press and leaves the cursor where it was`, async () => {
      const { context, page } = await aWindow(where)
      const chat = theChat(where)
      try {
        await typeTheSentence(page, chat)
        await pressTimes(page, 'ArrowLeft', SENTENCE.length - CURSOR_AT)
        expect(await theBoxNow(page, chat), 'the keys did not put the cursor where this case means').toEqual({ focused: true, start: CURSOR_AT, end: CURSOR_AT })

        await chooseTheFlag(page, chat, JUST_ASK)

        const press = page.locator(`${chat} .px-chat-write .px-chat-intent`)
        expect(await press.getAttribute('data-chosen')).toBe('yes')
        expect(await press.getAttribute('data-intent')).toBe('just-ask')
        expect(await press.locator('.px-chat-intent-word').textContent()).toBe(JUST_ASK_SHORT)
        expect(await theMarksInTheBox(page, chat)).toEqual([])

        expect(await theBoxNow(page, chat), 'the box does not have the focus, with the cursor where it was').toEqual({ focused: true, start: CURSOR_AT, end: CURSOR_AT })
        await page.keyboard.type('X')
        expect(await page.locator(`${chat} .px-chat-write textarea`).inputValue()).toBe(`${SENTENCE.slice(0, CURSOR_AT)}X${SENTENCE.slice(CURSOR_AT)}`)
      } finally {
        await context.close()
      }
    }, 180_000)
  }
})
